const { readDb, extractMetadata } = require("../_lib/store");

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

const SUPPORTED_TYPES = new Set(["skills", "tags", "degrees", "countries"]);

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return sendJson(res, 405, { message: "Method not allowed" });
    }

    const type = String(req.query.type || "").toLowerCase();
    if (!SUPPORTED_TYPES.has(type)) {
      return sendJson(res, 404, { message: "Metadata type not found" });
    }

    const db = await readDb();
    const values = extractMetadata(db, type);
    return sendJson(res, 200, values);
  } catch (error) {
    return sendJson(res, 500, { message: "Server error", error: error.message });
  }
};
