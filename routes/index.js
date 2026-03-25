var express = require("express");
var router = express.Router();

router.get("/", function (req, res) {
  res.json({
    result: true,
    message: "BUZZ backend is running",
  });
});

module.exports = router;