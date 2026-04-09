const express = require("express");

const { formatCode } = require("../services/formatter");

const router = express.Router();

router.post("/format-code", async (req, res) => {
  const { code, language } = req.body;

  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  try {
    const result = await formatCode(code, language);
    return res.json(result);
  } catch (error) {
    if (error.message === "Unsupported language") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;