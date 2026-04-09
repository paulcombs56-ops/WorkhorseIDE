const { spawn } = require("child_process");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const { ensureSseHeaders, writeSse } = require("../utils/sse");

async function runCodeInSandbox({ res, code, fileName, command, args, sandboxRoot, execTimeoutMs, maxStreamBytes }) {
  await fsp.mkdir(sandboxRoot, { recursive: true });

  const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const runDir = path.join(sandboxRoot, runId);
  const filePath = path.join(runDir, fileName);

  await fsp.mkdir(runDir, { recursive: true });
  await fsp.writeFile(filePath, code, "utf-8");

  let streamBytes = 0;
  let terminatedForLimit = false;

  ensureSseHeaders(res);
  writeSse(res, "__START__");

  const child = spawn(command, args, {
    cwd: runDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timeoutHandle = setTimeout(() => {
    if (!child.killed) {
      child.kill();
      writeSse(res, `ERROR: Execution timed out after ${Math.floor(execTimeoutMs / 1000)} seconds`);
    }
  }, execTimeoutMs);

  const handleChunk = (prefix, chunk) => {
    if (terminatedForLimit) {
      return;
    }

    streamBytes += chunk.length;
    if (streamBytes > maxStreamBytes) {
      terminatedForLimit = true;
      writeSse(res, "ERROR: Output limit reached, process terminated");
      child.kill();
      return;
    }

    const text = chunk.toString();
    writeSse(res, prefix ? `${prefix}${text}` : text);
  };

  child.stdout.on("data", (chunk) => handleChunk("", chunk));
  child.stderr.on("data", (chunk) => handleChunk("ERROR: ", chunk));

  res.on("close", () => {
    if (!child.killed) {
      child.kill();
    }
  });

  child.on("close", async () => {
    clearTimeout(timeoutHandle);
    writeSse(res, "__END__");
    res.end();
    await fsp.rm(runDir, { recursive: true, force: true });
  });
}

module.exports = {
  runCodeInSandbox,
};