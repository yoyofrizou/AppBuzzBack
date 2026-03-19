const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookings",
      default: null,
    },

    provider: {
      type: String,
      enum: ["stripe"],
      default: "stripe",
    },

    paymentIntentId: {
      type: String,
      required: true,
      unique: true,
    },

    chargeId: {
      type: String,
      default: null,
    },

    transferId: {
      type: String,
      default: null,
    },

    refundId: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "eur",
    },

    platformFee: {
      type: Number,
      default: 0,
    },

    driverAmount: {
      type: Number,
      default: 0,
    },

    seatsBooked: {
      type: Number,
      default: 1,
    },

    paymentMethod: {
      type: String,
      enum: ["card", "apple_pay", "google_pay", "unknown"],
      default: "card",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "requires_payment_method",
        "requires_action",
        "paid",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("payments", paymentSchema);

module.exports = Payment;