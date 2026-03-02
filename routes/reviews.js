const express = require("express");
const router = express.Router();
const Review = require("../models/reviews");
const Ride = require("../models/rides");
const User = require("../models/users");

router.post("/add", (req, res) => {
  if (!req.body.note || !req.body.message) {
    return res.json({
      result: false,
      error: "Remplir tous les champs.",
    });
  }

  const newReview = new Review({
    note: req.body.note,
    message: req.body.message,
    ride: req.body.ride,
    user: req.body.user,
  });
  
  newReview.save().then((data) => {
    res.json({ result: true, review: data });
  });
});

module.exports = router;
