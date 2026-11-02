const { pool, hash, errJson } = require("../lib/util");

/* ── helpers ─────────────────────────────────────────────── */

/**
 * Build hub list from v_hub_status rows, grouping compartments per hub.
 * @param {Array} rows – rows from v_hub_status
 * @param {boolean} withDistance – true when a distance column is present
 */
const groupHubs = (rows, withDistance) => {
  const map = new Map();
  for (const r of rows) {
    let hub = map.get(r.hub_id);
    if (!hub) {
      hub = {
        hub_id: r.hub_id,
        name: r.hub_name,
        address: r.address,
        hub_type: r.hub_type,
        latitude: r.latitude,
        longitude: r.longitude,
        status: r.hub_status,
        compartments: []
      };
      if (withDistance) hub.distance_km = r.distance_km;
      map.set(r.hub_id, hub);
    }
    hub.compartments.push({
      compartment_id: r.compartment_id,
      label: r.label,
      temp_controlled: r.temp_controlled,
      free_kg: r.free_kg,
      accepting: r.accepting
    });
  }
  return [...map.values()];
};

/**
 * Add available_items count to each hub in the array (mutates).
 */
const attachAvailableItems = async (hubs) => {
  if (hubs.length === 0) return hubs;
  const ids = hubs.map(h => h.hub_id);
  const [counts] = await pool.query(
    `SELECT hub_id, COUNT(*) cnt
       FROM FOOD_LISTING
      WHERE hub_id IN (${ids.map(() => "?").join(",")})
        AND status = 'AVAILABLE' AND expires_at > NOW()
      GROUP BY hub_id`,
    ids
  );
  const cntMap = new Map(counts.map(c => [c.hub_id, c.cnt]));
  for (const h of hubs) h.available_items = cntMap.get(h.hub_id) || 0;
  return hubs;
};

/* ── handler ─────────────────────────────────────────────── */

module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {};
  try {
    /* ---------- list ---------- */
    if (a === "list") {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const hasCoords = !isNaN(lat) && !isNaN(lng);

      let sql, params;
      if (hasCoords) {
        sql = `SELECT v.*,
                      ROUND(fn_distance_km(?,?,v.latitude,v.longitude),1) AS distance_km
                 FROM v_hub_status v
                ORDER BY distance_km`;
        params = [lat, lng];
      } else {
        sql = `SELECT v.* FROM v_hub_status v ORDER BY v.hub_name`;
        params = [];
      }
      const [rows] = await pool.query(sql, params);
      const hubs = groupHubs(rows, hasCoords);
      return res.json(await attachAvailableItems(hubs));
    }

    /* ---------- nearest ---------- */
    if (a === "nearest") {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      if (isNaN(lat) || isNaN(lng))
        return res.status(400).json({ error: "lat and lng are required" });

      const [rows] = await pool.query(
        `SELECT v.*,
                ROUND(fn_distance_km(?,?,v.latitude,v.longitude),1) AS distance_km
           FROM v_hub_status v
          WHERE v.hub_status = 'ACTIVE'
          ORDER BY distance_km`,
        [lat, lng]
      );
      const hubs = groupHubs(rows, true);
      return res.json(await attachAvailableItems(hubs.slice(0, 3)));
    }

    /* ---------- checkin ---------- */
    if (a === "checkin") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
      const hubId = b.hub_id;
      if (!hubId) return res.status(400).json({ error: "hub_id is required" });
      const temp = (b.temp !== undefined && b.temp !== null && b.temp !== "") ? Number(b.temp) : 3.5;
      await pool.query("CALL sp_hub_checkin(?,?)", [hubId, temp]);
      return res.json({ ok: true });
    }

    /* ---------- kiosk ---------- */
    if (a === "kiosk") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
      const handoverId = b.handover_id;
      const code = b.code;
      if (!handoverId || code === undefined || code === null || code === "")
        return res.status(400).json({ error: "handover_id and code are required" });

      const [[ho]] = await pool.query(
        `SELECT h.*, c.label
           FROM HUB_HANDOVER h
           JOIN HUB_COMPARTMENT c ON c.compartment_id = h.compartment_id
          WHERE h.handover_id = ?`,
        [handoverId]
      );
      if (!ho) return res.status(404).json({ error: "Handover not found" });

      const st = ho.status;

      if (st === "LOCKED") {
        return res.status(400).json({ error: "Locked after 3 wrong codes. Ask the hub steward." });
      }

      const codeHash = hash(String(code));

      if (st === "AWAITING_DROP") {
        if (codeHash === ho.drop_code_hash) {
          await pool.query(
            "UPDATE HUB_HANDOVER SET status='DROPPED', dropped_at=NOW() WHERE handover_id=? AND status='AWAITING_DROP'",
            [handoverId]);
          return res.json({
            action: "DROP_OK",
            compartment: ho.label,
            message: `Compartment ${ho.label} unlocked. Place the food inside and close the door.`
          });
        }
        // wrong code
        try {
          await pool.query(
            "UPDATE HUB_HANDOVER SET failed_attempts=failed_attempts+1 WHERE handover_id=?",
            [handoverId]
          );
        } catch (e) {
          return res.status(400).json({ error: e.sqlMessage || e.message });
        }
        const [[updated]] = await pool.query(
          "SELECT failed_attempts FROM HUB_HANDOVER WHERE handover_id=?",
          [handoverId]
        );
        const left = 3 - (updated ? updated.failed_attempts : 0);
        return res.status(400).json({ error: `Wrong code. ${left} attempts left.` });
      }

      if (st === "DROPPED") {
        if (codeHash === ho.pickup_code_hash) {
          await pool.query(
            "UPDATE HUB_HANDOVER SET status='COLLECTED', collected_at=NOW() WHERE handover_id=? AND status='DROPPED'",
            [handoverId]);
          return res.json({
            action: "COLLECT_OK",
            compartment: ho.label,
            message: `Compartment ${ho.label} unlocked. Take your food.`
          });
        }
        // wrong code
        try {
          await pool.query(
            "UPDATE HUB_HANDOVER SET failed_attempts=failed_attempts+1 WHERE handover_id=?",
            [handoverId]
          );
        } catch (e) {
          return res.status(400).json({ error: e.sqlMessage || e.message });
        }
        const [[updated]] = await pool.query(
          "SELECT failed_attempts FROM HUB_HANDOVER WHERE handover_id=?",
          [handoverId]
        );
        const left = 3 - (updated ? updated.failed_attempts : 0);
        return res.status(400).json({ error: `Wrong code. ${left} attempts left.` });
      }

      return res.status(400).json({ error: `Nothing to do for this order (status ${st}).` });
    }

    return res.status(404).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(400).json(errJson(e));
  }
};
