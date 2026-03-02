const express = require("express");
const router = express.Router();
const Review = require("../models/reviews");

if (!note || !message) {
  return res.json({
    result: false,
    error: "Remplir tous les champs.",
  });
}

router.post("/", (req, res) => {
  const newReview = new Review({
    note: req.body.note,
    message: req.body.message,
  });
  newReview
    .save()
    .then((data) => {
      res.json({ result: true, review: data });
    })
});

module.exports = router;
