const mongoose = require("mongoose");

const bookingSchema = mongoose.Schema(
  {
    message: {
      type: String,
      default: "",
    },

    // statut du passager dans le flow conducteur
    bookingStatus: {
      type: String,
      enum: ["pending", "validated", "absent", "cancelled"],
      default: "pending",
      index: true,
    },

    // statut du paiement Stripe
    paymentStatus: {
      type: String,
      enum: ["authorized", "captured", "cancelled"],
      default: "authorized",
      index: true,
    },

    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    // passager ayant réservé
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    seatsBooked: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    paymentIntentId: {
      type: String,
      default: null,
    },

    // montant préautorisé
    maxAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    // montant réellement capturé
    finalAmount: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { timestamps: true }
);

// un passager ne peut pas réserver 2 fois le même trajet
bookingSchema.index({ ride: 1, passenger: 1 }, { unique: true });

const Booking = mongoose.model("bookings", bookingSchema);

module.exports = Booking;