const bcrypt = require("bcryptjs");
const { pool, user, sign, geocode, errJson } = require("../lib/util");

const COL = { DONOR: "donor_id", RECIPIENT: "recipient_id", VOLUNTEER: "volunteer_id" };

module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {};
  try {
    if (a === "me") {
      const u = user(req);
      if (!u) return res.json({ user: null });
      if (!u.name && u.role && u.pid && COL[u.role]) {
        const [[p]] = await pool.query(`SELECT name FROM ${u.role} WHERE ${COL[u.role]}=?`, [u.pid]);
        if (p) u.name = p.name;
      }
      return res.json({ user: u });
    }

    if (a === "logout") {
      res.setHeader("Set-Cookie", "t=; Path=/; Max-Age=0");
      return res.json({ ok: 1 });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!COL[b.role]) return res.status(400).json({ error: "Choose a role" });

    if (a === "login") {
      const [[r]] = await pool.query("SELECT * FROM APP_USER WHERE email=? AND role=?", [b.email, b.role]);
      if (!r || !(await bcrypt.compare(b.password || "", r.password_hash)))
        return res.status(401).json({ error: "Wrong email, password or role" });
      const pid = r[COL[r.role]];
      let name = "";
      if (r.role && pid && COL[r.role]) {
        const [[p]] = await pool.query(`SELECT name FROM ${r.role} WHERE ${COL[r.role]}=?`, [pid]);
        if (p) name = p.name;
      }
      const u = { id: r.user_id, role: r.role, pid, name };
      sign(res, u);
      return res.json({ user: u });
    }

    if (a === "register") {
      if (!b.email || !b.name || !b.phone || (b.password || "").length < 6)
        return res.status(400).json({ error: "Fill every field. Password needs 6+ characters." });

      let lat = 28.6139, lng = 77.2090;
      const addr = b.address || b.home_address;
      if (addr && typeof addr === "string" && addr.trim()) {
        try {
          const coords = await geocode(addr.trim());
          if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
            lat = coords.lat;
            lng = coords.lng;
          }
        } catch (e) {}
      }

      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        let r;
        if (b.role === "DONOR") {
          [r] = await c.query(
            "INSERT INTO DONOR(name,donor_type,phone,email,address,latitude,longitude) VALUES(?,?,?,?,?,?,?)",
            [b.name, b.type || b.donor_type || "RESTAURANT", b.phone, b.email, b.address || "Delhi", lat, lng]
          );
        } else if (b.role === "RECIPIENT") {
          const dailyCapacity = (b.daily_capacity !== undefined && b.daily_capacity !== null && b.daily_capacity !== "") ? Number(b.daily_capacity) : 50;
          const hasColdStorage = b.has_cold_storage ? 1 : 0;
          [r] = await c.query(
            "INSERT INTO RECIPIENT(name,recipient_type,phone,email,address,latitude,longitude,daily_capacity,has_cold_storage) VALUES(?,?,?,?,?,?,?,?,?)",
            [b.name, b.type || b.recipient_type || "NGO", b.phone, b.email, b.address || "Delhi", lat, lng, dailyCapacity, hasColdStorage]
          );
        } else {
          const serviceRadiusKm = (b.service_radius_km !== undefined && b.service_radius_km !== null && b.service_radius_km !== "") ? Number(b.service_radius_km) : 10;
          const vrole = b.vrole || "FOOD_ONLY";
          [r] = await c.query(
            "INSERT INTO VOLUNTEER(name,phone,email,vehicle_type,role,latitude,longitude,service_radius_km) VALUES(?,?,?,?,?,?,?,?)",
            [b.name, b.phone, b.email, b.type || b.vehicle_type || "BIKE", vrole, lat, lng, serviceRadiusKm]
          );
        }
        const [ins] = await c.query(
          `INSERT INTO APP_USER(email,password_hash,role,${COL[b.role]}) VALUES(?,?,?,?)`,
          [b.email, await bcrypt.hash(b.password, 10), b.role, r.insertId]
        );
        await c.commit();
        if (b.role === "RECIPIENT") {
          try { await pool.query("CALL sp_refresh_all_matches()"); } catch (e) {}
        }
        const u = { id: ins.insertId, role: b.role, pid: r.insertId, name: b.name };
        sign(res, u);
        return res.json({ user: u });
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    }

    res.status(404).json({ error: "Unknown action" });
  } catch (e) {
    res.status(400).json(errJson(e));
  }
};
