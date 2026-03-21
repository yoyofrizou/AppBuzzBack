const mongoose = require("mongoose");

const messageSchema = mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "conversations",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["system", "user"],
      default: "user",
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },

    content: {
      type: String,
      required: true,
      default: "",
    },

    visibleTo: {
      type: String,
      enum: ["driver_only", "passenger_only", "both"],
      default: "both",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("messages", messageSchema);