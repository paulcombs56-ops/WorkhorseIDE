const { spawn } = require("child_process");
const fsp = require("fs/promises");
const path = require("path");

const { resolveWorkspacePath } = require("../utils/pathUtils");

function sanitizeProcessArgs(args, maxExeArgs) {
  if (!Array.isArray(args)) {
    return [];
  }

  return args
    .slice(0, maxExeArgs)
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

async function launchExecutable(workspaceRoot, relativePath, rawArgs, maxExeArgs) {
  const absPath = resolveWorkspacePath(relativePath, workspaceRoot);
  const stat = await fsp.stat(absPath);

  if (!stat.isFile()) {
    throw new Error("Path is not a file");
  }

  if (path.extname(absPath).toLowerCase() !== ".exe") {
    throw new Error("Only .exe files can be launched");
  }

  const args = sanitizeProcessArgs(rawArgs, maxExeArgs);
  const child = spawn(absPath, args, {
    cwd: path.dirname(absPath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();

  return {
    launched: true,
    path: relativePath,
    args,
    pid: child.pid,
  };
}

module.exports = {
  launchExecutable,
};