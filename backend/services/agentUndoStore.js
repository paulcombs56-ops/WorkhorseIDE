const fsp = require("fs/promises");
const path = require("path");

async function ensureParentDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

async function readHistory(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    return [];
  }
}

async function writeHistory(filePath, entries) {
  await ensureParentDir(filePath);
  await fsp.writeFile(filePath, JSON.stringify(entries, null, 2), "utf8");
}

function createAgentUndoStore({ historyFilePath, maxEntries = 20 }) {
  async function addEntry(entry) {
    const history = await readHistory(historyFilePath);
    const next = [entry, ...history].slice(0, maxEntries);
    await writeHistory(historyFilePath, next);
    return entry;
  }

  async function removeEntry(undoId) {
    const history = await readHistory(historyFilePath);
    const index = history.findIndex((entry) => entry.undoId === undoId);
    if (index < 0) {
      return null;
    }
    const [removed] = history.splice(index, 1);
    await writeHistory(historyFilePath, history);
    return removed;
  }

  async function listEntries() {
    const history = await readHistory(historyFilePath);
    return history.map((entry) => ({
      undoId: entry.undoId,
      createdAt: entry.createdAt,
      operationCount: Array.isArray(entry.inverseOperations) ? entry.inverseOperations.length : 0,
      summary: entry.summary || "",
    }));
  }

  return {
    addEntry,
    removeEntry,
    listEntries,
  };
}

module.exports = {
  createAgentUndoStore,
};
