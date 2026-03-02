const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema({
  note: String,
  message: String,
  rides: { type: mongoose.Schema.Types.ObjectId, ref: "rides" },
});

const Review = mongoose.model("reviews", reviewSchema);

module.exports = Review;