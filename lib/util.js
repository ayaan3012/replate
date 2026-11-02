const mysql = require("mysql2/promise"), jwt = require("jsonwebtoken");
const pool = global._pool || (global._pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  connectionLimit: 3
}));
const user = req => {
  try { const m = (req.headers.cookie || "").match(/(?:^|; )t=([^;]+)/); return m ? jwt.verify(m[1], process.env.JWT_SECRET) : null; }
  catch (e) { return null; }
};
const sign = (res, u) => res.setHeader("Set-Cookie",
  `t=${jwt.sign(u, process.env.JWT_SECRET, { expiresIn: "7d" })}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax; Secure`);
module.exports = { pool, user, sign };
