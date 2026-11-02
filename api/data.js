const { pool, user, errJson, makeCode, hash } = require("../lib/util");

// Helper: throw if volunteer's vrole doesn't cover the required task type
const needVolunteerRole = (vrole, type) => {
  // type is 'FOOD' or 'WASTE'
  if (type === "FOOD" && vrole !== "FOOD_ONLY" && vrole !== "DUAL")
    throw new Error("Your volunteer role does not include food deliveries");
  if (type === "WASTE" && vrole !== "WASTE_ONLY" && vrole !== "DUAL")
    throw new Error("Your volunteer role does not include waste runs");
};

module.exports = async (req, res) => {
  const u = user(req);
  if (!u) return res.status(401).json({ error: "Please log in" });
  const a = req.query.a, b = req.body || {};
  const q = async (s, p) => (await pool.query(s, p))[0];
  const need = r => { if (u.role !== r) throw new Error("Not allowed for your role"); };

  try {
    switch (a) {

      // ── profile ─────────────────────────────────────────────────────────────
      case "profile": {
        let row;
        if (u.role === "DONOR") {
          [row] = await pool.query(
            "SELECT donor_name name, address, latitude, longitude, donor_type type FROM DONOR WHERE donor_id=?",
            [u.pid]);
        } else if (u.role === "RECIPIENT") {
          [row] = await pool.query(
            "SELECT org_name name, address, latitude, longitude, recipient_type type FROM RECIPIENT WHERE recipient_id=?",
            [u.pid]);
        } else {
          // Volunteer: include vrole and service_radius_km so UI knows which tabs to show
          [row] = await pool.query(
            `SELECT volunteer_name name, home_address address, home_lat latitude, home_lng longitude,
                    vehicle_type type, volunteer_role vrole, service_radius_km
             FROM VOLUNTEER WHERE volunteer_id=?`,
            [u.pid]);
        }
        const profile = row[0];
        if (!profile) return res.status(404).json({ error: "Profile not found" });
        return res.json({ ...profile, role: u.role });
      }

      // ── categories ──────────────────────────────────────────────────────────
      case "categories":
        return res.json(await q(
          "SELECT category_id id, category_name name FROM FOOD_CATEGORY ORDER BY category_name"));

      // ── tags ────────────────────────────────────────────────────────────────
      case "tags":
        return res.json(await q(
          "SELECT tag_id id, tag_name name, tag_type type FROM TAG ORDER BY tag_type, tag_name"));

      // ── addListing ──────────────────────────────────────────────────────────
      case "addListing": {
        need("DONOR");
        const {
          category_id, food_name, qty, unit, weight, hours,
          storage, is_sealed, hub_id,
          tag_ids = [], allergens = []
        } = b;

        if (hub_id && storage === "HOT")
          return res.status(400).json({ error: "Hub listings cannot use HOT storage" });

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const sealedVal = hub_id ? 1 : (is_sealed ? 1 : 0);

          const [ins] = await conn.query(
            `INSERT INTO FOOD_LISTING
              (donor_id, category_id, food_name, quantity_total, quantity_unit,
               weight_per_unit_kg, storage_type, is_sealed,
               hub_id, ready_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW() + INTERVAL ? HOUR)`,
            [u.pid, category_id, food_name, qty, unit, weight,
             storage, sealedVal, hub_id || null, hours]);
          const listingId = ins.insertId;

          for (const tid of tag_ids)
            await conn.query(
              "INSERT INTO LISTING_TAG (listing_id, tag_id, contains_flag) VALUES (?, ?, 1)",
              [listingId, tid]);

          for (const alg of allergens)
            await conn.query(
              "INSERT INTO LISTING_TAG (listing_id, tag_id, contains_flag) VALUES (?, ?, ?)",
              [listingId, alg.tag_id, alg.contains ? 1 : 0]);

          const checkType = hub_id ? "SEAL" : "VISUAL";
          await conn.query(
            "INSERT INTO FOOD_SAFETY_CHECK (listing_id, stage, check_type, result) VALUES (?, 'LISTING', ?, 'PASS')",
            [listingId, checkType]);

          await conn.commit();
          try { await pool.query("CALL sp_compute_match_scores(?)", [listingId]); } catch (_) {}
          return res.json({ id: listingId });
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }

      // ── reportUnfit ─────────────────────────────────────────────────────────
      case "reportUnfit": {
        need("DONOR");
        const { category_id, food_name, qty, unit, weight, grade } = b;
        if (!["ANIMAL_OK", "BIOGAS_ONLY"].includes(grade))
          return res.status(400).json({ error: "grade must be ANIMAL_OK or BIOGAS_ONLY" });

        const kg = qty * weight;
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [ins] = await conn.query(
            `INSERT INTO FOOD_LISTING
              (donor_id, category_id, food_name, quantity_total, quantity_unit,
               weight_per_unit_kg, storage_type, is_sealed,
               ready_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'AMBIENT', 0,
                     NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR)`,
            [u.pid, category_id, food_name, qty, unit || "kg", weight]);
          const listingId = ins.insertId;

          let [[partnerRow]] = await conn.query(
            "SELECT fn_pick_partner(?, ?, ?) AS partner_id",
            [grade === "ANIMAL_OK" ? "FARM" : "BIOGAS", category_id, kg]);

          if ((!partnerRow || !partnerRow.partner_id) && grade === "ANIMAL_OK") {
            [[partnerRow]] = await conn.query(
              "SELECT fn_pick_partner('ANIMAL_SHELTER', ?, ?) AS partner_id",
              [category_id, kg]);
          }

          if (!partnerRow || !partnerRow.partner_id) {
            await conn.rollback();
            return res.status(400).json({ error: "No partner accepts this food right now" });
          }
          const partnerId = partnerRow.partner_id;

          const [[partner]] = await conn.query(
            "SELECT partner_name, partner_type FROM WASTE_PARTNER WHERE partner_id=?",
            [partnerId]);

          await conn.query(
            `INSERT INTO WASTE_ROUTING (listing_id, route_type, partner_id, condition_grade, quantity_kg)
             VALUES (?, ?, ?, ?, ?)`,
            [listingId, partner.partner_type, partnerId, grade, kg]);

          await conn.query(
            "UPDATE FOOD_LISTING SET status='ROUTED' WHERE listing_id=?",
            [listingId]);

          await conn.commit();
          return res.json({ partner_name: partner.partner_name, route_type: partner.partner_type, kg });
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }

      // ── myListings ──────────────────────────────────────────────────────────
      case "myListings": {
        need("DONOR");
        const listings = await q(
          `SELECT l.listing_id, l.food_name, l.status, l.expires_at,
                  l.quantity_unit, v.quantity_remaining,
                  l.storage_type, h.hub_name
           FROM FOOD_LISTING l
           JOIN v_listing_remaining v ON v.listing_id = l.listing_id
           LEFT JOIN HUB h ON h.hub_id = l.hub_id
           WHERE l.donor_id = ?
           ORDER BY l.listing_id DESC`,
          [u.pid]);

        for (const row of listings) {
          if (row.hub_name) {
            const handovers = await q(
              `SELECT hh.handover_id, hh.claim_id,
                      r.org_name AS recipient_name,
                      c.quantity_claimed, hh.status,
                      hc.label AS compartment_label
               FROM HUB_HANDOVER hh
               JOIN CLAIM c ON c.claim_id = hh.claim_id
               JOIN FOOD_LISTING fl ON fl.listing_id = c.listing_id
               LEFT JOIN RECIPIENT r ON r.recipient_id = c.recipient_id
               LEFT JOIN HUB_COMPARTMENT hc ON hc.compartment_id = hh.compartment_id
               WHERE fl.donor_id = ? AND fl.listing_id = ?
               ORDER BY hh.handover_id`,
              [u.pid, row.listing_id]);

            row.handovers = handovers.map(hv => ({
              handover_id: hv.handover_id,
              claim_id: hv.claim_id,
              recipient_name: hv.recipient_name,
              quantity_claimed: hv.quantity_claimed,
              status: hv.status,
              compartment_label: hv.compartment_label,
              drop_code: hv.status === "AWAITING_DROP" ? makeCode(hv.claim_id, "drop") : null
            }));
          } else {
            row.handovers = [];
          }
        }
        return res.json(listings);
      }

      // ── myRoutings ──────────────────────────────────────────────────────────
      case "myRoutings": {
        need("DONOR");
        return res.json(await q(
          `SELECT l.food_name, wr.route_type, wp.partner_name, wr.quantity_kg, wr.status
           FROM WASTE_ROUTING wr
           JOIN FOOD_LISTING l ON l.listing_id = wr.listing_id
           JOIN WASTE_PARTNER wp ON wp.partner_id = wr.partner_id
           WHERE l.donor_id = ?
           ORDER BY wr.routing_id DESC`,
          [u.pid]));
      }

      // ── feed ────────────────────────────────────────────────────────────────
      case "feed": {
        need("RECIPIENT");

        const [[recip]] = await pool.query(
          "SELECT has_cold_storage FROM RECIPIENT WHERE recipient_id=?", [u.pid]);
        const hasCold = recip && recip.has_cold_storage;

        const hubFilter = req.query.hub_id ? " AND l.hub_id = ?" : "";
        const feedParams = [u.pid, u.pid, hasCold ? 1 : 0];
        if (req.query.hub_id) feedParams.push(Number(req.query.hub_id));

        return res.json(await q(
          `SELECT a.listing_id, a.food_name, a.donor_name, a.tags,
                  a.quantity_remaining, a.quantity_unit, a.minutes_left,
                  l.storage_type, l.hub_id, h.hub_name,
                  m.score
           FROM v_active_listings a
           JOIN FOOD_LISTING l ON l.listing_id = a.listing_id
           LEFT JOIN HUB h ON h.hub_id = l.hub_id
           LEFT JOIN MATCH_SCORE m
             ON m.listing_id = a.listing_id AND m.recipient_id = ?
           WHERE fn_listing_meets_needs(a.listing_id, ?) = 1
             AND (l.storage_type NOT IN ('REFRIGERATED','FROZEN') OR ? = 1)
             ${hubFilter}
           ORDER BY (m.score IS NULL), m.score DESC, a.minutes_left`,
          feedParams
        ));
      }

      // ── claim ────────────────────────────────────────────────────────────────
      case "claim": {
        need("RECIPIENT");
        const { listing_id, qty } = b;

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [ins] = await conn.query(
            "INSERT INTO CLAIM (listing_id, recipient_id, quantity_claimed) VALUES (?, ?, ?)",
            [listing_id, u.pid, qty]);
          const claimId = ins.insertId;

          const [[listing]] = await conn.query(
            "SELECT hub_id, storage_type, weight_per_unit_kg, expires_at FROM FOOD_LISTING WHERE listing_id=?",
            [listing_id]);

          if (!listing.hub_id) {
            await conn.commit();
            return res.json({ claim_id: claimId, handover_id: null, hub_name: null, compartment: null, pickup_code: null });
          }

          const needsCold = ["REFRIGERATED", "FROZEN"].includes(listing.storage_type) ? 1 : 0;
          const requiredKg = qty * listing.weight_per_unit_kg;

          const [compartments] = await conn.query(
            `SELECT vs.compartment_id, vs.label, vs.free_kg, h.hub_name
             FROM v_hub_status vs
             JOIN HUB h ON h.hub_id = vs.hub_id
             WHERE vs.hub_id = ?
               AND vs.temp_controlled = ?
               AND vs.free_kg >= ?
               AND vs.accepting = 1
             ORDER BY vs.free_kg DESC
             LIMIT 1`,
            [listing.hub_id, needsCold, requiredKg]);

          if (!compartments.length) {
            await conn.rollback();
            return res.status(400).json({ error: "This hub cannot take the food right now" });
          }

          const comp = compartments[0];

          const [hins] = await conn.query(
            `INSERT INTO HUB_HANDOVER
              (claim_id, compartment_id, drop_code_hash, pickup_code_hash, code_expires_at)
             VALUES (?, ?, ?, ?, LEAST(
               (SELECT expires_at FROM FOOD_LISTING WHERE listing_id=?),
               NOW() + INTERVAL 24 HOUR))`,
            [claimId, comp.compartment_id,
             hash(makeCode(claimId, "drop")),
             hash(makeCode(claimId, "pickup")),
             listing_id]);

          await conn.commit();
          return res.json({
            claim_id: claimId,
            handover_id: hins.insertId,
            hub_name: comp.hub_name,
            compartment: comp.label,
            pickup_code: makeCode(claimId, "pickup")
          });
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }

      // ── myClaims ─────────────────────────────────────────────────────────────
      case "myClaims": {
        need("RECIPIENT");
        const claims = await q(
          `SELECT c.claim_id, l.food_name, d.donor_name, c.quantity_claimed,
                  c.claim_status,
                  p.pickup_status,
                  v.volunteer_name,
                  hh.handover_id, hh.status AS handover_status,
                  h.hub_name, hc.label AS compartment_label
           FROM CLAIM c
           JOIN FOOD_LISTING l ON l.listing_id = c.listing_id
           JOIN DONOR d ON d.donor_id = l.donor_id
           LEFT JOIN PICKUP p ON p.claim_id = c.claim_id
           LEFT JOIN VOLUNTEER v ON v.volunteer_id = p.volunteer_id
           LEFT JOIN HUB_HANDOVER hh ON hh.claim_id = c.claim_id
           LEFT JOIN HUB_COMPARTMENT hc ON hc.compartment_id = hh.compartment_id
           LEFT JOIN HUB h ON h.hub_id = hc.hub_id
           WHERE c.recipient_id = ?
           ORDER BY c.claim_id DESC`,
          [u.pid]);

        return res.json(claims.map(row => ({
          claim_id: row.claim_id,
          food_name: row.food_name,
          donor_name: row.donor_name,
          quantity_claimed: row.quantity_claimed,
          claim_status: row.claim_status,
          pickup_status: row.pickup_status,
          volunteer_name: row.volunteer_name,
          handover_id: row.handover_id,
          handover_status: row.handover_status,
          hub_name: row.hub_name,
          compartment_label: row.compartment_label,
          pickup_code: (row.handover_status === "AWAITING_DROP" || row.handover_status === "DROPPED")
            ? makeCode(row.claim_id, "pickup")
            : null
        })));
      }

      // ── myImpact — role-branched ──────────────────────────────────────────────
      case "myImpact": {
        if (u.role === "RECIPIENT") {
          const [[summary]] = await pool.query(
            `SELECT
               COUNT(DISTINCT c.claim_id)            AS claims_completed,
               COALESCE(SUM(ir.quantity_kg), 0)       AS kg_received,
               COALESCE(SUM(ir.meals_equivalent), 0)  AS meals_received
             FROM CLAIM c
             LEFT JOIN PICKUP p       ON p.claim_id  = c.claim_id
             LEFT JOIN HUB_HANDOVER hh ON hh.claim_id = c.claim_id
             LEFT JOIN IMPACT_RECORD ir
               ON ir.pickup_id = p.pickup_id OR ir.handover_id = hh.handover_id
             WHERE c.recipient_id = ? AND c.claim_status = 'COMPLETED'`,
            [u.pid]);
          return res.json(summary);
        }

        if (u.role === "VOLUNTEER") {
          const [[summary]] = await pool.query(
            `SELECT
               COUNT(DISTINCT p.pickup_id)            AS deliveries_completed,
               COALESCE(SUM(ir.quantity_kg), 0)       AS kg_delivered,
               COALESCE(SUM(ir.meals_equivalent), 0)  AS meals_delivered,
               COALESCE(
                 (SELECT SUM(wc.weighed_kg)
                  FROM WASTE_COLLECTION wc
                  WHERE wc.volunteer_id = ?), 0)       AS waste_kg_collected
             FROM PICKUP p
             LEFT JOIN IMPACT_RECORD ir ON ir.pickup_id = p.pickup_id
             WHERE p.volunteer_id = ? AND p.pickup_status = 'DELIVERED'`,
            [u.pid, u.pid]);
          return res.json(summary);
        }

        // DONOR
        need("DONOR");
        const [rows] = await pool.query(
          "SELECT meals_saved, kg_diverted, co2_avoided_kg, trust_score FROM v_donor_impact WHERE donor_id=?",
          [u.pid]);
        return res.json(rows[0] || { meals_saved: 0, kg_diverted: 0, co2_avoided_kg: 0, trust_score: 0 });
      }

      // ════════════════════════════════════════════════════════════════════════
      // VOLUNTEER — FOOD DELIVERIES (FOOD_ONLY or DUAL)
      // ════════════════════════════════════════════════════════════════════════

      // ── jobs ─────────────────────────────────────────────────────────────────
      case "jobs": {
        need("VOLUNTEER");

        // Ensure upcoming slots exist for the next 7 days
        try { await pool.query("CALL sp_ensure_slots(7)"); } catch (_) {}

        const [[vol]] = await pool.query(
          "SELECT home_lat, home_lng, service_radius_km, volunteer_role vrole FROM VOLUNTEER WHERE volunteer_id=?",
          [u.pid]);
        needVolunteerRole(vol.vrole, "FOOD");

        // One query per claim — attach eligible slots in JS to avoid a complex correlated subquery
        const claims = await q(
          `SELECT
             c.claim_id,
             l.food_name,
             c.quantity_claimed,
             d.address           AS pickup_from,
             r.address           AS deliver_to,
             l.expires_at,
             fn_distance_km(?, ?, d.latitude, d.longitude)  AS distance_km,
             fn_distance_km(?, ?, d.latitude, d.longitude) <= v.service_radius_km
                                  AS within_radius,
             r.receiving_from,
             r.receiving_until
           FROM CLAIM c
           JOIN FOOD_LISTING l  ON l.listing_id   = c.listing_id
           JOIN DONOR d         ON d.donor_id      = l.donor_id
           JOIN RECIPIENT r     ON r.recipient_id  = c.recipient_id
           JOIN VOLUNTEER v     ON v.volunteer_id  = ?
           WHERE c.claim_status IN ('PENDING','APPROVED')
             AND l.hub_id IS NULL
             AND l.expires_at > NOW()
             AND NOT EXISTS (
               SELECT 1 FROM PICKUP p
               WHERE p.claim_id = c.claim_id
                 AND p.pickup_status IN ('SCHEDULED','ACCEPTED','IN_TRANSIT','DELIVERED'))
           ORDER BY distance_km`,
          [vol.home_lat, vol.home_lng, vol.home_lat, vol.home_lng, u.pid]);

        // Fetch eligible FOOD slots once (not per-claim) then filter in JS
        const allSlots = await q(
          `SELECT s.slot_id, s.slot_date, s.start_time, s.end_time, s.capacity,
                  (SELECT COUNT(*) FROM PICKUP p2
                   WHERE p2.slot_id = s.slot_id
                     AND p2.pickup_status NOT IN ('CANCELLED','FAILED')) AS active_pickups
           FROM DELIVERY_SLOT s
           WHERE s.run_type = 'FOOD'
             AND TIMESTAMP(s.slot_date, s.start_time) > NOW()
             AND s.slot_date >= CURDATE()
             AND fn_volunteer_slot_conflict(?, s.slot_id) = 0`,
          [u.pid]);

        const result = claims.map(c => {
          const eligibleSlots = allSlots.filter(s =>
            // slot must end before or at listing expiry
            new Date(`${s.slot_date.toISOString ? s.slot_date.toISOString().slice(0,10) : String(s.slot_date).slice(0,10)}T${s.end_time}`) <= new Date(c.expires_at) &&
            // respect recipient receiving window if set
            (!c.receiving_from || s.start_time >= c.receiving_from) &&
            (!c.receiving_until || s.end_time <= c.receiving_until) &&
            // free capacity
            s.active_pickups < s.capacity
          ).map(s => ({
            slot_id: s.slot_id,
            slot_date: s.slot_date,
            start_time: s.start_time,
            end_time: s.end_time
          }));

          return {
            claim_id: c.claim_id,
            food_name: c.food_name,
            quantity_claimed: c.quantity_claimed,
            pickup_from: c.pickup_from,
            deliver_to: c.deliver_to,
            expires_at: c.expires_at,
            distance_km: c.distance_km,
            within_radius: !!c.within_radius,
            slots: eligibleSlots
          };
        });

        return res.json(result);
      }

      // ── accept ────────────────────────────────────────────────────────────────
      case "accept": {
        need("VOLUNTEER");
        const [[vol]] = await pool.query(
          "SELECT volunteer_role vrole FROM VOLUNTEER WHERE volunteer_id=?", [u.pid]);
        needVolunteerRole(vol.vrole, "FOOD");

        const [ins] = await pool.query(
          "INSERT INTO PICKUP (claim_id, volunteer_id, slot_id) VALUES (?, ?, ?)",
          [b.claim_id, u.pid, b.slot_id]);
        await pool.query(
          "UPDATE PICKUP SET pickup_status='ACCEPTED' WHERE pickup_id=?",
          [ins.insertId]);
        return res.json({ ok: 1, pickup_id: ins.insertId });
      }

      // ── setStatus ─────────────────────────────────────────────────────────────
      case "setStatus": {
        need("VOLUNTEER");
        const { pickup_id, status, failure_reason } = b;
        const validStatuses = ["IN_TRANSIT", "DELIVERED", "FAILED"];
        const validReasons  = ["FOOD_UNSAFE", "RECIPIENT_UNAVAILABLE", "VEHICLE_BREAKDOWN", "OTHER"];

        if (!validStatuses.includes(status))
          return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
        if (status === "FAILED" && !validReasons.includes(failure_reason))
          return res.status(400).json({ error: `failure_reason must be one of: ${validReasons.join(", ")}` });

        if (status === "FAILED") {
          await pool.query(
            `UPDATE PICKUP
             SET pickup_status = 'FAILED', failure_reason = ?,
                 delivered_at = NULL
             WHERE pickup_id = ? AND volunteer_id = ?`,
            [failure_reason, pickup_id, u.pid]);
        } else {
          await pool.query(
            `UPDATE PICKUP
             SET pickup_status = ?,
                 delivered_at = IF(? = 'DELIVERED', NOW(), delivered_at)
             WHERE pickup_id = ? AND volunteer_id = ?`,
            [status, status, pickup_id, u.pid]);
        }
        return res.json({ ok: 1 });
      }

      // ── myPickups ─────────────────────────────────────────────────────────────
      case "myPickups": {
        need("VOLUNTEER");
        return res.json(await q(
          `SELECT p.pickup_id, l.food_name, c.quantity_claimed, p.pickup_status,
                  d.address  AS pickup_from,
                  r.address  AS deliver_to,
                  s.slot_date, s.start_time, s.end_time,
                  p.delivered_at
           FROM PICKUP p
           JOIN CLAIM c        ON c.claim_id    = p.claim_id
           JOIN FOOD_LISTING l ON l.listing_id  = c.listing_id
           JOIN DONOR d        ON d.donor_id    = l.donor_id
           JOIN RECIPIENT r    ON r.recipient_id = c.recipient_id
           LEFT JOIN DELIVERY_SLOT s ON s.slot_id = p.slot_id
           WHERE p.volunteer_id = ?
           ORDER BY p.pickup_id DESC`,
          [u.pid]));
      }

      // ── deliver (legacy alias → setStatus DELIVERED) ──────────────────────────
      case "deliver": {
        need("VOLUNTEER");
        await pool.query(
          `UPDATE PICKUP SET pickup_status='DELIVERED', delivered_at=NOW()
           WHERE pickup_id=? AND volunteer_id=? AND pickup_status<>'DELIVERED'`,
          [b.pickup_id, u.pid]);
        return res.json({ ok: 1 });
      }

      // ════════════════════════════════════════════════════════════════════════
      // VOLUNTEER — WASTE RUNS (WASTE_ONLY or DUAL)
      // ════════════════════════════════════════════════════════════════════════

      // ── wasteJobs ─────────────────────────────────────────────────────────────
      case "wasteJobs": {
        need("VOLUNTEER");
        const [[vol]] = await pool.query(
          "SELECT volunteer_role vrole FROM VOLUNTEER WHERE volunteer_id=?", [u.pid]);
        needVolunteerRole(vol.vrole, "WASTE");

        return res.json(await q(
          `SELECT wr.routing_id AS waste_id,
                  l.food_name,
                  d.address    AS donor_address,
                  wr.quantity_kg,
                  wr.condition_grade,
                  wr.route_type,
                  wp.partner_id,
                  wp.partner_name,
                  wp.address   AS partner_address
           FROM WASTE_ROUTING wr
           JOIN FOOD_LISTING l   ON l.listing_id  = wr.listing_id
           JOIN DONOR d          ON d.donor_id     = l.donor_id
           JOIN WASTE_PARTNER wp ON wp.partner_id  = wr.partner_id
           WHERE wr.status = 'PENDING'
             AND wr.collection_id IS NULL
           ORDER BY wr.routing_id`));
      }

      // ── wasteSlots ────────────────────────────────────────────────────────────
      case "wasteSlots": {
        need("VOLUNTEER");

        try { await pool.query("CALL sp_ensure_slots(7)"); } catch (_) {}

        const [[vol]] = await pool.query(
          "SELECT volunteer_role vrole FROM VOLUNTEER WHERE volunteer_id=?", [u.pid]);
        needVolunteerRole(vol.vrole, "WASTE");

        return res.json(await q(
          `SELECT s.slot_id, s.slot_date, s.start_time, s.end_time,
                  s.capacity,
                  (SELECT COUNT(*) FROM WASTE_COLLECTION wc
                   WHERE wc.slot_id = s.slot_id) AS booked
           FROM DELIVERY_SLOT s
           WHERE s.run_type = 'WASTE'
             AND s.slot_date >= CURDATE()
             AND TIMESTAMP(s.slot_date, s.start_time) > NOW()
             AND s.capacity > (SELECT COUNT(*) FROM WASTE_COLLECTION wc WHERE wc.slot_id = s.slot_id)
             AND fn_volunteer_slot_conflict(?, s.slot_id) = 0
           ORDER BY s.slot_date, s.start_time`,
          [u.pid]));
      }

      // ── containers ────────────────────────────────────────────────────────────
      case "containers": {
        need("VOLUNTEER");
        return res.json(await q(
          `SELECT container_id, container_label, container_type, capacity_kg
           FROM CONTAINER
           WHERE container_type = 'WASTE'
           ORDER BY container_label`));
      }

      // ── collect ───────────────────────────────────────────────────────────────
      case "collect": {
        need("VOLUNTEER");
        const { waste_ids, slot_id, container_id, vehicle_no, weighed_kg } = b;

        if (!Array.isArray(waste_ids) || !waste_ids.length)
          return res.status(400).json({ error: "waste_ids must be a non-empty array" });

        const [[vol]] = await pool.query(
          "SELECT volunteer_role vrole FROM VOLUNTEER WHERE volunteer_id=?", [u.pid]);
        needVolunteerRole(vol.vrole, "WASTE");

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Verify all waste_ids belong to the same partner and are still PENDING
          const placeholders = waste_ids.map(() => "?").join(",");
          const [rows] = await conn.query(
            `SELECT DISTINCT wr.partner_id
             FROM WASTE_ROUTING wr
             WHERE wr.routing_id IN (${placeholders})
               AND wr.status = 'PENDING'
               AND wr.collection_id IS NULL`,
            waste_ids);

          if (rows.length === 0)
            throw new Error("No matching PENDING waste routings found");
          if (rows.length > 1)
            throw new Error("All waste_ids must belong to the same partner");

          const partnerId = rows[0].partner_id;
          const receiptRef = `RCPT-${partnerId}-${Date.now()}`;

          const [ins] = await conn.query(
            `INSERT INTO WASTE_COLLECTION
              (partner_id, slot_id, volunteer_id, container_id,
               source_type, vehicle_no, weighed_kg, receipt_ref)
             VALUES (?, ?, ?, ?, 'DONOR_SITE', ?, ?, ?)`,
            [partnerId, slot_id, u.pid, container_id, vehicle_no, weighed_kg, receiptRef]);
          const collectionId = ins.insertId;

          // Link routings — trigger on WASTE_ROUTING will set status='COMPLETED'
          await conn.query(
            `UPDATE WASTE_ROUTING
             SET collection_id = ?
             WHERE routing_id IN (${placeholders}) AND status = 'PENDING'`,
            [collectionId, ...waste_ids]);

          await conn.commit();
          return res.json({ ok: 1, collection_id: collectionId, receipt_ref: receiptRef });
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }

      // ── myCollections ─────────────────────────────────────────────────────────
      case "myCollections": {
        need("VOLUNTEER");
        return res.json(await q(
          `SELECT wc.collection_id, wp.partner_name, wc.weighed_kg,
                  wc.receipt_ref, wc.collected_at
           FROM WASTE_COLLECTION wc
           JOIN WASTE_PARTNER wp ON wp.partner_id = wc.partner_id
           WHERE wc.volunteer_id = ?
           ORDER BY wc.collection_id DESC`,
          [u.pid]));
      }

      default:
        return res.status(404).json({ error: "Unknown action" });
    }
  } catch (e) {
    res.status(400).json(errJson(e));
  }
};
