const {
  readDb,
  writeDb,
  getNextId,
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
    if (req.method === "GET") {
      const db = await readDb();
      return sendJson(res, 200, db);
    }

    if (req.method === "POST") {
      if (!checkWriteAuth(req)) {
        return sendJson(res, 401, { message: "Unauthorized" });
      }

      const db = await readDb();
      const payload = parseBody(req);
      const id = getNextId(db);
      const resume = normalizeResumePayload(payload);
      resume.id = id;
      db[id] = resume;
      await writeDb(db);

      return sendJson(res, 201, { id, message: "Resume created" });
    }

    return sendJson(res, 405, { message: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { message: "Server error", error: error.message });
  }
};
