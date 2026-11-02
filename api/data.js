const { pool, user, errJson, makeCode } = require("../lib/util");

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
          [row] = await pool.query(
            "SELECT volunteer_name name, home_address address, home_lat latitude, home_lng longitude, vehicle_type type FROM VOLUNTEER WHERE volunteer_id=?",
            [u.pid]);
        }
        const profile = row[0];
        if (!profile) return res.status(404).json({ error: "Profile not found" });
        return res.json(profile);
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

        // Validate storage vs hub
        if (hub_id && storage === "HOT") {
          return res.status(400).json({ error: "Hub listings cannot use HOT storage" });
        }

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Hub listing: force is_sealed=1
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

          // Diet tags → LISTING_TAG with contains_flag=1
          for (const tid of tag_ids) {
            await conn.query(
              "INSERT INTO LISTING_TAG (listing_id, tag_id, contains_flag) VALUES (?, ?, 1)",
              [listingId, tid]);
          }

          // Allergen rows with caller-supplied contains flag
          for (const alg of allergens) {
            await conn.query(
              "INSERT INTO LISTING_TAG (listing_id, tag_id, contains_flag) VALUES (?, ?, ?)",
              [listingId, alg.tag_id, alg.contains ? 1 : 0]);
          }

          // Safety check — VISUAL for direct donations, SEAL for hub listings
          const checkType = hub_id ? "SEAL" : "VISUAL";
          await conn.query(
            "INSERT INTO FOOD_SAFETY_CHECK (listing_id, stage, check_type, result) VALUES (?, 'LISTING', ?, 'PASS')",
            [listingId, checkType]);

          await conn.commit();

          // Fire-and-forget match score computation
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
        if (!["ANIMAL_OK", "BIOGAS_ONLY"].includes(grade)) {
          return res.status(400).json({ error: "grade must be ANIMAL_OK or BIOGAS_ONLY" });
        }

        const kg = qty * weight;
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Insert an already-expired listing (not fit for human consumption)
          const [ins] = await conn.query(
            `INSERT INTO FOOD_LISTING
              (donor_id, category_id, food_name, quantity_total, quantity_unit,
               weight_per_unit_kg, storage_type, is_sealed,
               ready_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'AMBIENT', 0,
                     NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR)`,
            [u.pid, category_id, food_name, qty, unit || "kg", weight]);
          const listingId = ins.insertId;

          // Pick a partner
          let [[partnerRow]] = await conn.query(
            "SELECT fn_pick_partner(?, ?, ?) AS partner_id",
            [grade === "ANIMAL_OK" ? "FARM" : "BIOGAS", category_id, kg]);

          if ((!partnerRow || !partnerRow.partner_id) && grade === "ANIMAL_OK") {
            // Fallback to ANIMAL_SHELTER
            [[partnerRow]] = await conn.query(
              "SELECT fn_pick_partner('ANIMAL_SHELTER', ?, ?) AS partner_id",
              [category_id, kg]);
          }

          if (!partnerRow || !partnerRow.partner_id) {
            await conn.rollback();
            return res.status(400).json({ error: "No partner accepts this food right now" });
          }
          const partnerId = partnerRow.partner_id;

          // Fetch partner details
          const [[partner]] = await conn.query(
            "SELECT partner_name, partner_type FROM WASTE_PARTNER WHERE partner_id=?",
            [partnerId]);

          // Insert routing row
          await conn.query(
            `INSERT INTO WASTE_ROUTING
              (listing_id, route_type, partner_id, condition_grade, quantity_kg)
             VALUES (?, ?, ?, ?, ?)`,
            [listingId, partner.partner_type, partnerId, grade, kg]);

          // Mark listing as ROUTED
          await conn.query(
            "UPDATE FOOD_LISTING SET status='ROUTED' WHERE listing_id=?",
            [listingId]);

          await conn.commit();
          return res.json({
            partner_name: partner.partner_name,
            route_type: partner.partner_type,
            kg
          });
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

        // For hub listings, attach handovers
        for (const row of listings) {
          if (row.hub_name) {
            const handovers = await q(
              `SELECT hh.handover_id, hh.claim_id,
                      COALESCE(d.donor_name, r.org_name) AS recipient_name,
                      c.quantity_claimed, hh.status,
                      hc.label AS compartment_label
               FROM HUB_HANDOVER hh
               JOIN CLAIM c ON c.claim_id = hh.claim_id
               JOIN FOOD_LISTING fl ON fl.listing_id = c.listing_id
               LEFT JOIN DONOR d ON d.donor_id = fl.donor_id AND 1=0
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

      // ── myImpact ────────────────────────────────────────────────────────────
      case "myImpact": {
        need("DONOR");
        const [rows] = await pool.query(
          "SELECT meals_saved, kg_diverted, co2_avoided_kg, trust_score FROM v_donor_impact WHERE donor_id=?",
          [u.pid]);
        return res.json(rows[0] || { meals_saved: 0, kg_diverted: 0, co2_avoided_kg: 0, trust_score: 0 });
      }

      // ── feed ────────────────────────────────────────────────────────────────
      case "feed": {
        need("RECIPIENT");
        return res.json(await q(
          `SELECT a.listing_id, a.food_name, a.donor_name, a.tags,
                  a.quantity_remaining, a.quantity_unit, a.minutes_left, m.score
           FROM v_active_listings a
           LEFT JOIN MATCH_SCORE m ON m.listing_id = a.listing_id AND m.recipient_id = ?
           ORDER BY (m.score IS NULL), m.score DESC, a.minutes_left`,
          [u.pid]));
      }

      // ── claim ────────────────────────────────────────────────────────────────
      case "claim": {
        need("RECIPIENT");
        await pool.query(
          "INSERT INTO CLAIM (listing_id, recipient_id, quantity_claimed) VALUES (?, ?, ?)",
          [b.listing_id, u.pid, b.qty]);
        return res.json({ ok: 1 });
      }

      // ── myClaims ─────────────────────────────────────────────────────────────
      case "myClaims": {
        need("RECIPIENT");
        return res.json(await q(
          `SELECT c.claim_id, l.food_name, c.quantity_claimed, c.claim_status, p.pickup_status
           FROM CLAIM c
           JOIN FOOD_LISTING l ON l.listing_id = c.listing_id
           LEFT JOIN PICKUP p ON p.claim_id = c.claim_id
           WHERE c.recipient_id = ?
           ORDER BY c.claim_id DESC`,
          [u.pid]));
      }

      // ── jobs ─────────────────────────────────────────────────────────────────
      case "jobs": {
        need("VOLUNTEER");
        const jobs = await q(
          `SELECT c.claim_id, l.food_name, c.quantity_claimed,
                  d.address pickup_from, r.address deliver_to
           FROM CLAIM c
           JOIN FOOD_LISTING l ON l.listing_id = c.listing_id
           JOIN DONOR d ON d.donor_id = l.donor_id
           JOIN RECIPIENT r ON r.recipient_id = c.recipient_id
           WHERE c.claim_status = 'PENDING' AND l.hub_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM PICKUP p
               WHERE p.claim_id = c.claim_id AND p.pickup_status <> 'CANCELLED')`);
        const slots = await q(
          `SELECT s.slot_id, s.slot_date, s.start_time, s.pickup_area
           FROM DELIVERY_SLOT s
           WHERE s.slot_date >= CURDATE()
             AND s.capacity > (
               SELECT COUNT(*) FROM PICKUP p
               WHERE p.slot_id = s.slot_id AND p.pickup_status <> 'CANCELLED')`);
        return res.json({ jobs, slots });
      }

      // ── accept ────────────────────────────────────────────────────────────────
      case "accept": {
        need("VOLUNTEER");
        await pool.query(
          "INSERT INTO PICKUP (claim_id, volunteer_id, slot_id) VALUES (?, ?, ?)",
          [b.claim_id, u.pid, b.slot_id]);
        return res.json({ ok: 1 });
      }

      // ── myPickups ─────────────────────────────────────────────────────────────
      case "myPickups": {
        need("VOLUNTEER");
        return res.json(await q(
          `SELECT p.pickup_id, l.food_name, p.pickup_status,
                  d.address pickup_from, r.address deliver_to
           FROM PICKUP p
           JOIN CLAIM c ON c.claim_id = p.claim_id
           JOIN FOOD_LISTING l ON l.listing_id = c.listing_id
           JOIN DONOR d ON d.donor_id = l.donor_id
           JOIN RECIPIENT r ON r.recipient_id = c.recipient_id
           WHERE p.volunteer_id = ?
           ORDER BY p.pickup_id DESC`,
          [u.pid]));
      }

      // ── deliver ───────────────────────────────────────────────────────────────
      case "deliver": {
        need("VOLUNTEER");
        await pool.query(
          `UPDATE PICKUP SET pickup_status='DELIVERED'
           WHERE pickup_id=? AND volunteer_id=? AND pickup_status<>'DELIVERED'`,
          [b.pickup_id, u.pid]);
        return res.json({ ok: 1 });
      }

      default:
        return res.status(404).json({ error: "Unknown action" });
    }
  } catch (e) {
    res.status(400).json(errJson(e));
  }
};
