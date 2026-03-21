const mongoose = require("mongoose");

const bookingSchema = mongoose.Schema(
  {
    message: String,

    status: {     //statut du paiement ici pas du trajet car le statut du trajet est dans ride
      type: String,
      enum: ["authorized", "captured", "cancelled"],
      default: "authorized",
      index: true,
    },

    paymentIntentId: {
      type: String,
      default: null,
      index: true,
    },

    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    seatsBooked: {
  type: Number,
  required: true,
  default: 1,
  enum: [1],
  set: () => 1, //même si quelqu’un envoie seatsBooked: 5 → ça devient 1 automatiquement
},

    maxAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    finalAmount: {
      type: Number,
      default: null,
      min: 0,
    },
  passengerPresenceStatus: {
      type: String,
      enum: ["pending", "scanned", "manual", "absent"],
      default: "pending",
      index: true,
    },

  manualValidatedAt: {
  type: Date,
  default: null,
},

    scannedAt: {
      type: Date,
      default: null,
    },

    absentMarkedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


bookingSchema.index({ ride: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("bookings", bookingSchema);

/* const mongoose = require("mongoose");

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

module.exports = Booking; */