const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema({
  note: String,
  message: String,
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "rides" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
});

const Review = mongoose.model("reviews", reviewSchema);

module.exports = Review;