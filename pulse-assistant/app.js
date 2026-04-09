const express = require("express");
const cors = require("cors");
const fsp = require("fs/promises");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3010);
const FRONTEND_ROOT = path.resolve(__dirname, "public");
const DEFAULT_STORE_FILE = path.resolve(__dirname, "data", "pulse-store.json");
const STORE_FILE = process.env.PULSE_STORE_FILE
  ? path.resolve(process.env.PULSE_STORE_FILE)
  : DEFAULT_STORE_FILE;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(FRONTEND_ROOT));

async function ensureStoreFile() {
  await fsp.mkdir(path.dirname(STORE_FILE), { recursive: true });
  try {
    await fsp.access(STORE_FILE);
  } catch {
    await fsp.writeFile(STORE_FILE, JSON.stringify({ sessions: {} }, null, 2), "utf-8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fsp.readFile(STORE_FILE, "utf-8");
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

async function writeStore(data) {
  await ensureStoreFile();
  await fsp.writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeState(input) {
  let notes = "";
  if (typeof input?.notes === "string") {
    notes = input.notes;
  } else if (Array.isArray(input?.notes)) {
    notes = input.notes.join("\n");
  }

  const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const reminders = Array.isArray(input?.reminders) ? input.reminders : [];
  const updatedAt = Number(input?.updatedAt);

  return {
    notes: notes.slice(0, 20000),
    tasks: tasks.slice(0, 500),
    reminders: reminders.slice(0, 500),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "pulse-assistant" });
});

app.get("/api/state", async (req, res) => {
  try {
    const syncCode = String(req.query.syncCode || "").trim();
    if (!syncCode) {
      return res.status(400).json({ error: "Query parameter 'syncCode' is required" });
    }

    const store = await readStore();
    const session = normalizeState(store.sessions[syncCode] || {});
    return res.json({ state: session });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load state", details: error.message });
  }
});

app.post("/api/state", async (req, res) => {
  try {
    const syncCode = String(req.body?.syncCode || "").trim();
    if (!syncCode) {
      return res.status(400).json({ error: "Body field 'syncCode' is required" });
    }

    const incomingState = normalizeState(req.body?.state || {});
    const store = await readStore();
    const existingState = normalizeState(store.sessions[syncCode] || {});
    const finalState = incomingState.updatedAt >= existingState.updatedAt ? incomingState : existingState;

    store.sessions[syncCode] = finalState;
    await writeStore(store);
    return res.json({ saved: true, state: finalState });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save state", details: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Pulse Assistant running on http://localhost:${PORT}`);
  });
}

module.exports = { app, normalizeState };