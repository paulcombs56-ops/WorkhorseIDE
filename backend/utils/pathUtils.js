const path = require("path");

function resolveWorkspacePath(relativePath = "", workspaceRoot) {
  const normalizedRelative = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const targetPath = path.resolve(workspaceRoot, normalizedRelative);

  if (targetPath !== workspaceRoot && !targetPath.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Path escapes workspace root");
  }

  return targetPath;
}

function shouldIgnoreExplorerEntry(name, relPath) {
  if (!name) return true;

  const lowerName = name.toLowerCase();
  const lowerRel = String(relPath || "").toLowerCase();

  if ([".git", ".vs", ".idea", "node_modules", "__pycache__", ".venv", "venv"].includes(lowerName)) {
    return true;
  }

  if (lowerRel.startsWith("sandbox/runs")) {
    return true;
  }

  return false;
}

module.exports = {
  resolveWorkspacePath,
  shouldIgnoreExplorerEntry,
};