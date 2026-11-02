const { pool, user } = require("../lib/util");
module.exports = async (req, res) => {
  const u = user(req);
  if (!u) return res.status(401).json({ error: "Please log in" });
  const a = req.query.a, b = req.body || {};
  const q = async (s, p) => (await pool.query(s, p))[0];
  const need = r => { if (u.role !== r) throw new Error("Not allowed for your role"); };
  try {
    switch (a) {
      case "categories":
        return res.json(await q("SELECT category_id id, category_name name FROM FOOD_CATEGORY"));
      case "myListings": need("DONOR");
        return res.json(await q(`SELECT l.listing_id,l.food_name,l.status,l.expires_at,l.quantity_unit,v.quantity_remaining
          FROM FOOD_LISTING l JOIN v_listing_remaining v ON v.listing_id=l.listing_id
          WHERE l.donor_id=? ORDER BY l.listing_id DESC`, [u.pid]));
      case "addListing": { need("DONOR");
        const [r] = await pool.query(`INSERT INTO FOOD_LISTING(donor_id,category_id,food_name,quantity_total,quantity_unit,
          weight_per_unit_kg,ready_at,expires_at,storage_type) VALUES(?,?,?,?,?,?,NOW(),NOW()+INTERVAL ? HOUR,?)`,
          [u.pid, b.category_id, b.food_name, b.qty, b.unit, b.weight, b.hours, b.storage]);
        // demo shortcut: a passing visual check opens the listing (the trigger sets AVAILABLE)
        await pool.query("INSERT INTO FOOD_SAFETY_CHECK(listing_id,check_type,result) VALUES(?,'VISUAL','PASS')", [r.insertId]);
        try { await pool.query("CALL sp_compute_match_scores(?)", [r.insertId]); } catch (e) {}
        return res.json({ id: r.insertId }); }
      case "feed": need("RECIPIENT");
        return res.json(await q(`SELECT a.listing_id,a.food_name,a.donor_name,a.tags,a.quantity_remaining,a.quantity_unit,a.minutes_left,m.score
          FROM v_active_listings a LEFT JOIN MATCH_SCORE m ON m.listing_id=a.listing_id AND m.recipient_id=?
          ORDER BY (m.score IS NULL), m.score DESC, a.minutes_left`, [u.pid]));
      case "claim": need("RECIPIENT");
        await pool.query("INSERT INTO CLAIM(listing_id,recipient_id,quantity_claimed) VALUES(?,?,?)", [b.listing_id, u.pid, b.qty]);
        return res.json({ ok: 1 });
      case "myClaims": need("RECIPIENT");
        return res.json(await q(`SELECT c.claim_id,l.food_name,c.quantity_claimed,c.claim_status,p.pickup_status
          FROM CLAIM c JOIN FOOD_LISTING l ON l.listing_id=c.listing_id
          LEFT JOIN PICKUP p ON p.claim_id=c.claim_id WHERE c.recipient_id=? ORDER BY c.claim_id DESC`, [u.pid]));
      case "jobs": { need("VOLUNTEER");
        const jobs = await q(`SELECT c.claim_id,l.food_name,c.quantity_claimed,d.address pickup_from,r.address deliver_to
          FROM CLAIM c JOIN FOOD_LISTING l ON l.listing_id=c.listing_id
          JOIN DONOR d ON d.donor_id=l.donor_id JOIN RECIPIENT r ON r.recipient_id=c.recipient_id
          WHERE c.claim_status='PENDING' AND l.hub_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM PICKUP p WHERE p.claim_id=c.claim_id AND p.pickup_status<>'CANCELLED')`);
        const slots = await q(`SELECT s.slot_id,s.slot_date,s.start_time,s.pickup_area FROM DELIVERY_SLOT s
          WHERE s.slot_date>=CURDATE() AND s.capacity>(SELECT COUNT(*) FROM PICKUP p WHERE p.slot_id=s.slot_id AND p.pickup_status<>'CANCELLED')`);
        return res.json({ jobs, slots }); }
      case "accept": need("VOLUNTEER");
        await pool.query("INSERT INTO PICKUP(claim_id,volunteer_id,slot_id) VALUES(?,?,?)", [b.claim_id, u.pid, b.slot_id]);
        return res.json({ ok: 1 });
      case "myPickups": need("VOLUNTEER");
        return res.json(await q(`SELECT p.pickup_id,l.food_name,p.pickup_status,d.address pickup_from,r.address deliver_to
          FROM PICKUP p JOIN CLAIM c ON c.claim_id=p.claim_id JOIN FOOD_LISTING l ON l.listing_id=c.listing_id
          JOIN DONOR d ON d.donor_id=l.donor_id JOIN RECIPIENT r ON r.recipient_id=c.recipient_id
          WHERE p.volunteer_id=? ORDER BY p.pickup_id DESC`, [u.pid]));
      case "deliver": need("VOLUNTEER");
        await pool.query("UPDATE PICKUP SET pickup_status='DELIVERED' WHERE pickup_id=? AND volunteer_id=? AND pickup_status<>'DELIVERED'", [b.pickup_id, u.pid]);
        return res.json({ ok: 1 });
      default: return res.status(404).json({ error: "Unknown action" });
    }
  } catch (e) { res.status(400).json({ error: e.sqlMessage || e.message }); }
};
