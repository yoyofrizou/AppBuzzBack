const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
    },

    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    reviewedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const Review = mongoose.model("reviews", reviewSchema);

module.exports = Review;