const mongoose = require("mongoose");

const rateSchema = mongoose.Schema({
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
  reviewerRole: {
    type: String,
    enum: ["driver", "passenger"],
    required: true,
  },
  reviewedRole: {
    type: String,
    enum: ["driver", "passenger"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// empêche doublons
rateSchema.index(
  {
    ride: 1,
    reviewer: 1,
    reviewedUser: 1,
    reviewerRole: 1,
    reviewedRole: 1,
  },
  { unique: true }
);

// perf
rateSchema.index({ reviewedUser: 1, reviewedRole: 1 });

module.exports = mongoose.model("rates", rateSchema);