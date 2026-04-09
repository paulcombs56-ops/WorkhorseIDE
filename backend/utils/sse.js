function ensureSseHeaders(res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

function writeSse(res, text) {
  const content = String(text ?? "");
  const lines = content.replace(/\r/g, "").split("\n");

  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }

  res.write("\n");
}

module.exports = {
  ensureSseHeaders,
  writeSse,
};