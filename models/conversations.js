const mongoose = require("mongoose");

const conversationSchema = mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    driverName: {
      type: String,
      default: "",
    },

    passengerName: {
      type: String,
      default: "",
    },

    lastMessagePreviewDriver: {
      type: String,
      default: "",
    },

    lastMessagePreviewPassenger: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ ride: 1, driver: 1, passenger: 1 }, { unique: true });

module.exports = mongoose.model("conversations", conversationSchema);