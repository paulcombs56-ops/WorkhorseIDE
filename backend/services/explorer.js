const fsp = require("fs/promises");
const path = require("path");

const { resolveWorkspacePath, shouldIgnoreExplorerEntry } = require("../utils/pathUtils");

async function buildWorkspaceTree(absDir, relDir = "", depth = 0, maxDepth = 4) {
  if (depth > maxDepth) {
    return [];
  }

  const entries = await fsp.readdir(absDir, { withFileTypes: true });
  const sorted = entries.sort((a, b) => {
    const typeA = a.isDirectory() ? 0 : 1;
    const typeB = b.isDirectory() ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;
    return a.name.localeCompare(b.name);
  });

  const tree = [];
  for (const entry of sorted) {
    const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (shouldIgnoreExplorerEntry(entry.name, entryRel)) {
      continue;
    }

    if (entry.isDirectory()) {
      const childAbs = path.join(absDir, entry.name);
      const children = depth < maxDepth ? await buildWorkspaceTree(childAbs, entryRel, depth + 1, maxDepth) : [];
      tree.push({
        type: "directory",
        name: entry.name,
        path: entryRel,
        children,
      });
      continue;
    }

    tree.push({
      type: "file",
      name: entry.name,
      path: entryRel,
    });
  }

  return tree;
}

async function getWorkspaceTree(workspaceRoot, depth, maxExplorerDepth) {
  const boundedDepth = Math.max(1, Math.min(Number(depth || 4), maxExplorerDepth));
  const tree = await buildWorkspaceTree(workspaceRoot, "", 0, boundedDepth);
  return { root: workspaceRoot, tree };
}

async function getWorkspaceFile(workspaceRoot, relativePath, maxFileReadBytes) {
  const absPath = resolveWorkspacePath(relativePath, workspaceRoot);
  const stat = await fsp.stat(absPath);

  if (!stat.isFile()) {
    throw new Error("Path is not a file");
  }

  if (stat.size > maxFileReadBytes) {
    const error = new Error("File too large to load in explorer");
    error.statusCode = 413;
    error.extra = { size: stat.size };
    throw error;
  }

  const content = await fsp.readFile(absPath, "utf-8");
  return { path: relativePath, content };
}

module.exports = {
  getWorkspaceTree,
  getWorkspaceFile,
};