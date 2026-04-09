const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const PORT = 3110;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let child;
let tempDir;
let storeFile;

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the timeout expires.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

test.before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulse-assistant-test-"));
  storeFile = path.join(tempDir, "pulse-store.json");

  child = spawn(process.execPath, [path.join(__dirname, "..", "app.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      PULSE_STORE_FILE: storeFile,
    },
    stdio: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/health`);
});

test.after(async () => {
  if (child && !child.killed) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }

  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("health endpoint reports service online", async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "pulse-assistant");
});

test("state round-trip preserves notes tasks and reminders", async () => {
  const payload = {
    syncCode: "sync-roundtrip",
    state: {
      notes: "remember the launch checklist",
      tasks: [{ id: "t1", text: "Ship split project", done: false }],
      reminders: [{ id: "r1", text: "Verify phone sync", done: true }],
      updatedAt: 100,
    },
  };

  const postResponse = await fetch(`${BASE_URL}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(postResponse.status, 200);

  const getResponse = await fetch(`${BASE_URL}/api/state?syncCode=sync-roundtrip`);
  assert.equal(getResponse.status, 200);

  const body = await getResponse.json();
  assert.equal(body.state.notes, payload.state.notes);
  assert.deepEqual(body.state.tasks, payload.state.tasks);
  assert.deepEqual(body.state.reminders, payload.state.reminders);
});

test("older updates do not overwrite newer state", async () => {
  const syncCode = "sync-stale";

  let response = await fetch(`${BASE_URL}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      state: { notes: "fresh", tasks: [], reminders: [], updatedAt: 500 },
    }),
  });

  assert.equal(response.status, 200);

  response = await fetch(`${BASE_URL}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      syncCode,
      state: { notes: "stale", tasks: [], reminders: [], updatedAt: 200 },
    }),
  });

  assert.equal(response.status, 200);

  const getResponse = await fetch(`${BASE_URL}/api/state?syncCode=${encodeURIComponent(syncCode)}`);
  const body = await getResponse.json();
  assert.equal(body.state.notes, "fresh");
  assert.equal(body.state.updatedAt, 500);
});