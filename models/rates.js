const mongoose = require("mongoose");

const rateSchema = mongoose.Schema({
  rating: {
    type: Number,
    required: true,
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

module.exports = mongoose.model("rates", rateSchema);