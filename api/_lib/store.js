const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const PROJECT_DB_PATH = path.join(process.cwd(), "db.json");
const RUNTIME_DB_PATH = path.join(os.tmpdir(), "resume-builder-db.json");

let initialized = false;

async function ensureRuntimeDb() {
  if (initialized) return;
  try {
    await fs.access(RUNTIME_DB_PATH);
  } catch {
    const source = await fs.readFile(PROJECT_DB_PATH, "utf8");
    await fs.writeFile(RUNTIME_DB_PATH, source, "utf8");
  }
  initialized = true;
}

async function readDb() {
  await ensureRuntimeDb();
  const raw = await fs.readFile(RUNTIME_DB_PATH, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function writeDb(data) {
  await ensureRuntimeDb();
  await fs.writeFile(RUNTIME_DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getNextId(db) {
  const maxId = Object.keys(db)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .reduce((max, id) => Math.max(max, id), 0);
  return String(maxId + 1);
}

function normalizeResumePayload(payload, existingResume = null) {
  const incoming = payload && typeof payload === "object" ? payload : {};
  const merged = {
    ...(existingResume || {}),
    ...incoming,
    personalInfo: {
      ...(existingResume?.personalInfo || {}),
      ...(incoming.personalInfo || {}),
    },
  };

  if (incoming.profilePhotoOriginalBase64) {
    merged.personalInfo.profilePhotoOriginalUrl = incoming.profilePhotoOriginalBase64;
  }
  if (incoming.profilePhotoCroppedBase64) {
    merged.personalInfo.profilePhotoCroppedUrl = incoming.profilePhotoCroppedBase64;
  }

  delete merged.profilePhotoOriginalBase64;
  delete merged.profilePhotoCroppedBase64;

  return merged;
}

function extractMetadata(db, type) {
  const resumes = Object.values(db || {});
  const values = new Map();

  const addValue = (value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!values.has(key)) values.set(key, normalized);
  };

  for (const resume of resumes) {
    if (type === "skills") {
      for (const skill of resume.skills || []) addValue(skill?.name);
    }
    if (type === "tags") {
      for (const tag of resume.tags || []) addValue(tag);
    }
    if (type === "degrees") {
      for (const edu of resume.education || []) addValue(edu?.degree);
    }
    if (type === "countries") {
      addValue(resume?.personalInfo?.country);
    }
  }

  return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
}

function checkWriteAuth(req) {
  const expectedApiKey = process.env.ADMIN_API_KEY || "your_secret_admin_key";
  const providedApiKey = req.headers["x-api-key"];
  return providedApiKey === expectedApiKey;
}

module.exports = {
  readDb,
  writeDb,
  getNextId,
  normalizeResumePayload,
  extractMetadata,
  checkWriteAuth,
};
