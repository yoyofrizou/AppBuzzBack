const express = require("express");
const router = express.Router();
const Review = require("../models/reviews");
const Ride = require("../models/rides");
const User = require("../models/users");

router.post("/add", async (req, res) => {
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

  const review = await newReview.save()
    res.json({ result: true, review: review });
});

router.get("/:token", async (req, res) => {
  const user = await User.findOne({ token: req.params.token });
  if (!user) {
    return res.json({ result: false, error: "Review non trouvé" });
  }
  const reviews = await Review.find({ user: user._id })
  .populate("ride","user",);
  res.json({ result: true, reviews: reviews });
});

router.delete("/delete/:reviewId", async (req, res) => {
  const reviews = await Review.deleteOne({ _id: req.params.reviewId });
    if (reviews.deletedCount > 0) {
      res.json({ result: true, message: "Review supprimé" });
    } else {
      res.json({ result: false, error: "Review non trouvé" });
    }
});

module.exports = router;
