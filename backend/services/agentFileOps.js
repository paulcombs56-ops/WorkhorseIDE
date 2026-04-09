const fsp = require("fs/promises");
const path = require("path");

const { resolveWorkspacePath } = require("../utils/pathUtils");

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

async function readFileUtf8(absolutePath) {
  return fsp.readFile(absolutePath, "utf8");
}

async function createFile(workspaceRoot, relativePath, content = "") {
  const absolutePath = resolveWorkspacePath(relativePath, workspaceRoot);
  if (await pathExists(absolutePath)) {
    throw new Error(`File already exists: ${relativePath}`);
  }

  await ensureParentDir(absolutePath);
  await fsp.writeFile(absolutePath, String(content), "utf8");

  return {
    result: { op: "create", path: relativePath, success: true },
    inverse: { op: "delete", path: relativePath },
  };
}

async function editFile(workspaceRoot, relativePath, content) {
  const absolutePath = resolveWorkspacePath(relativePath, workspaceRoot);
  if (!(await pathExists(absolutePath))) {
    throw new Error(`File not found: ${relativePath}`);
  }

  const previousContent = await readFileUtf8(absolutePath);
  await fsp.writeFile(absolutePath, String(content), "utf8");

  return {
    result: { op: "edit", path: relativePath, success: true },
    inverse: { op: "edit", path: relativePath, content: previousContent },
  };
}

async function deleteFile(workspaceRoot, relativePath) {
  const absolutePath = resolveWorkspacePath(relativePath, workspaceRoot);
  if (!(await pathExists(absolutePath))) {
    throw new Error(`File not found: ${relativePath}`);
  }

  const stat = await fsp.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${relativePath}`);
  }

  const previousContent = await readFileUtf8(absolutePath);
  await fsp.unlink(absolutePath);

  return {
    result: { op: "delete", path: relativePath, success: true },
    inverse: { op: "create", path: relativePath, content: previousContent },
  };
}

async function renameFile(workspaceRoot, relativePath, newRelativePath) {
  const absolutePath = resolveWorkspacePath(relativePath, workspaceRoot);
  const absoluteNewPath = resolveWorkspacePath(newRelativePath, workspaceRoot);

  if (!(await pathExists(absolutePath))) {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (await pathExists(absoluteNewPath)) {
    throw new Error(`Target already exists: ${newRelativePath}`);
  }

  await ensureParentDir(absoluteNewPath);
  await fsp.rename(absolutePath, absoluteNewPath);

  return {
    result: { op: "rename", path: relativePath, newPath: newRelativePath, success: true },
    inverse: { op: "rename", path: newRelativePath, newPath: relativePath },
  };
}

async function applyOperation(workspaceRoot, operation) {
  const op = String(operation?.op || "").trim().toLowerCase();

  if (op === "create") {
    return createFile(workspaceRoot, operation.path, operation.content || "");
  }
  if (op === "edit") {
    return editFile(workspaceRoot, operation.path, operation.content || "");
  }
  if (op === "delete") {
    return deleteFile(workspaceRoot, operation.path);
  }
  if (op === "rename") {
    return renameFile(workspaceRoot, operation.path, operation.newPath);
  }

  throw new Error(`Unsupported operation: ${op || "unknown"}`);
}

async function applyOperationBatch(workspaceRoot, operations = []) {
  const options = arguments[2] || {};
  const mode = String(options.mode || "continue").trim().toLowerCase() === "stop_on_error" ? "stop_on_error" : "continue";
  const results = [];
  const inverseOperations = [];
  let stoppedOnError = false;

  function mapErrorCode(message = "") {
    const text = String(message || "").toLowerCase();
    if (text.includes("path escapes workspace root")) return "PATH_ESCAPE";
    if (text.includes("unsupported operation")) return "UNSUPPORTED_OPERATION";
    if (text.includes("file not found")) return "FILE_NOT_FOUND";
    if (text.includes("already exists") || text.includes("target already exists")) return "TARGET_EXISTS";
    if (text.includes("not a file")) return "NOT_A_FILE";
    return "OPERATION_FAILED";
  }

  for (const operation of operations) {
    try {
      const { result, inverse } = await applyOperation(workspaceRoot, operation);
      results.push({
        ...result,
        code: "OK",
      });
      if (inverse) {
        inverseOperations.push(inverse);
      }
    } catch (error) {
      results.push({
        op: String(operation?.op || "unknown"),
        path: operation?.path || "",
        newPath: operation?.newPath || "",
        success: false,
        code: mapErrorCode(error.message),
        error: error.message,
      });

      if (mode === "stop_on_error") {
        stoppedOnError = true;
        break;
      }
    }
  }

  return {
    results,
    inverseOperations,
    mode,
    stoppedOnError,
  };
}

module.exports = {
  applyOperation,
  applyOperationBatch,
};
