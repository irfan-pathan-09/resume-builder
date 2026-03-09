const {
  readDb,
  writeDb,
  normalizeResumePayload,
  checkWriteAuth,
} = require("../_lib/store");

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) {
      return sendJson(res, 400, { message: "Resume ID is required" });
    }

    const db = await readDb();
    const existing = db[id];

    if (req.method === "GET") {
      if (!existing) return sendJson(res, 404, { message: "Resume not found" });
      return sendJson(res, 200, existing);
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      if (!checkWriteAuth(req)) {
        return sendJson(res, 401, { message: "Unauthorized" });
      }
      if (!existing) return sendJson(res, 404, { message: "Resume not found" });

      const payload = parseBody(req);
      const updated = normalizeResumePayload(payload, existing);
      updated.id = id;
      db[id] = updated;
      await writeDb(db);

      return sendJson(res, 200, { id, message: "Resume updated" });
    }

    if (req.method === "DELETE") {
      if (!checkWriteAuth(req)) {
        return sendJson(res, 401, { message: "Unauthorized" });
      }
      if (!existing) return sendJson(res, 404, { message: "Resume not found" });

      delete db[id];
      await writeDb(db);
      return sendJson(res, 200, { id, message: "Resume deleted" });
    }

    return sendJson(res, 405, { message: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { message: "Server error", error: error.message });
  }
};
