const { geocode, errJson } = require("../lib/util");

module.exports = async (req, res) => {
  const a = req.query.a;
  try {
    if (a === "geocode") {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "GET only" });
      }
      const q = req.query.q;
      if (!q || !q.trim()) {
        return res.status(404).json({ error: "Address not found" });
      }
      const coords = await geocode(q.trim());
      if (!coords) {
        return res.status(404).json({ error: "Address not found" });
      }
      return res.json(coords);
    }
    return res.status(404).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(400).json(errJson(e));
  }
};
