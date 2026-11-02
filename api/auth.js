const bcrypt = require("bcryptjs"), { pool, user, sign } = require("../lib/util");
const COL = { DONOR: "donor_id", RECIPIENT: "recipient_id", VOLUNTEER: "volunteer_id" };
module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {};
  try {
    if (a === "me") return res.json({ user: user(req) });
    if (a === "logout") { res.setHeader("Set-Cookie", "t=; Path=/; Max-Age=0"); return res.json({ ok: 1 }); }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!COL[b.role]) return res.status(400).json({ error: "Choose a role" });
    if (a === "login") {
      const [[r]] = await pool.query("SELECT * FROM APP_USER WHERE email=? AND role=?", [b.email, b.role]);
      if (!r || !(await bcrypt.compare(b.password || "", r.password_hash)))
        return res.status(401).json({ error: "Wrong email, password or role" });
      const u = { id: r.user_id, role: r.role, pid: r[COL[r.role]] };
      sign(res, u); return res.json({ user: u });
    }
    if (a === "register") {
      if (!b.email || !b.name || !b.phone || (b.password || "").length < 6)
        return res.status(400).json({ error: "Fill every field. Password needs 6+ characters." });
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        let r;
        if (b.role === "DONOR") [r] = await c.query(
          "INSERT INTO DONOR(name,donor_type,phone,email,address,latitude,longitude) VALUES(?,?,?,?,?,28.6139,77.2090)",
          [b.name, b.type || "RESTAURANT", b.phone, b.email, b.address || "Delhi"]);
        else if (b.role === "RECIPIENT") [r] = await c.query(
          "INSERT INTO RECIPIENT(name,recipient_type,phone,email,address,latitude,longitude,daily_capacity) VALUES(?,?,?,?,?,28.6139,77.2090,50)",
          [b.name, b.type || "NGO", b.phone, b.email, b.address || "Delhi"]);
        else [r] = await c.query("INSERT INTO VOLUNTEER(name,phone,email,vehicle_type) VALUES(?,?,?,?)",
          [b.name, b.phone, b.email, b.type || "BIKE"]);
        const [ins] = await c.query(`INSERT INTO APP_USER(email,password_hash,role,${COL[b.role]}) VALUES(?,?,?,?)`,
          [b.email, await bcrypt.hash(b.password, 10), b.role, r.insertId]);
        await c.commit();
        if (b.role === "RECIPIENT") { try { await pool.query("CALL sp_refresh_all_matches()"); } catch (e) {} }
        const u = { id: ins.insertId, role: b.role, pid: r.insertId };
        sign(res, u); return res.json({ user: u });
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }
    res.status(404).json({ error: "Unknown action" });
  } catch (e) { res.status(400).json({ error: e.sqlMessage || e.message }); }
};
