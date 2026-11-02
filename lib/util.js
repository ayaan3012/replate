const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = global._pool || (() => {
  const p = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 3,
    timezone: "+05:30"
  });
  p.on("connection", conn => {
    conn.query("SET time_zone='+05:30'");
  });
  return (global._pool = p);
})();

const user = req => {
  try {
    const m = (req.headers.cookie || "").match(/(?:^|; )t=([^;]+)/);
    return m ? jwt.verify(m[1], process.env.JWT_SECRET) : null;
  } catch (e) {
    return null;
  }
};

const sign = (res, u) => res.setHeader(
  "Set-Cookie",
  `t=${jwt.sign(u, process.env.JWT_SECRET, { expiresIn: "7d" })}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax; Secure`
);

const errJson = e => ({ error: (e && e.sqlMessage) || (e && e.message) || String(e) });

const hash = code => crypto.createHash("sha256").update(String(code)).digest("hex");

const _rawCode = (claimId, kind) => {
  const h = crypto.createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`${claimId}:${kind}`)
    .digest("hex");
  return parseInt(h.slice(0, 8), 16) % 1000000;
};

const makeCode = (claimId, kind) => {
  if (kind === "drop") {
    return String(_rawCode(claimId, "drop")).padStart(6, "0");
  }
  if (kind === "pickup") {
    let p = _rawCode(claimId, "pickup");
    const d = _rawCode(claimId, "drop");
    if (p === d) {
      p = (p + 1) % 1000000;
    }
    return String(p).padStart(6, "0");
  }
  return String(_rawCode(claimId, kind)).padStart(6, "0");
};

const geoCache = new Map();
let lastGeocodeTime = 0;
let geocodeQueue = Promise.resolve();

const geocode = async address => {
  if (!address || typeof address !== "string" || !address.trim()) return null;
  const key = address.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);

  const execute = async () => {
    if (geoCache.has(key)) return geoCache.get(key);
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - lastGeocodeTime));
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    lastGeocodeTime = Date.now();

    try {
      const email = process.env.NOMINATIM_EMAIL || "";
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(address.trim())}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "FoodRescueApp/1.0 (" + email + ")"
        }
      });
      if (!res.ok) {
        geoCache.set(key, null);
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        geoCache.set(key, null);
        return null;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (isNaN(lat) || isNaN(lng)) {
        geoCache.set(key, null);
        return null;
      }
      const coords = { lat, lng };
      geoCache.set(key, coords);
      return coords;
    } catch (e) {
      return null;
    }
  };

  const current = geocodeQueue.then(execute);
  geocodeQueue = current.catch(() => {});
  return current;
};

module.exports = {
  pool,
  user,
  sign,
  errJson,
  hash,
  makeCode,
  geocode
};
