const express = require("express");

const router = express.Router();

router.get("/api/hello", (req, res) => {
  res.json({ message: "Workhorse backend online" });
});

module.exports = router;