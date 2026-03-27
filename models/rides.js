const mongoose = require("mongoose");

const rideSchema = mongoose.Schema(
  {

    departureAddress: {
      type: String,
      required: true,
      trim: true,
    },

    destinationAddress: {
      type: String,
      required: true,
      trim: true,
    },

    departureLatitude: {
      type: Number,
      required: true,
    },

    departureLongitude: {
      type: Number,
      required: true,
    },

    destinationLatitude: {
      type: Number,
      required: true,
    },

    destinationLongitude: {
      type: Number,
      required: true,
    },

    departureDateTime: {
      type: Date,
      required: true,
    },

    pickupWalkMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    dropoffWalkMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // prix affiché côté UI, en euros
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // nombre total de places proposées
    placesTotal: {
      type: Number,
      required: true,
      min: 1,
    },

    // nombre de places restantes
    placesLeft: {
      type: Number,
      required: true,
      min: 0,
    },

    // coût total estimé du trajet, en centimes
    totalCost: {
      type: Number,
      required: true,
      min: 1,
    },

   status: {
  type: String,
  enum: ["published", "started", "completed", "cancelled", "open"],
  default: "published",
  index: true,
},

    // conducteur côté users
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    // ne sert plus vraiment la car driver = user
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "drivers",
      default: null,
    },

    currentLatitude: {
  type: Number,
  default: null,
},

currentLongitude: {
  type: Number,
  default: null,
},

locationUpdatedAt: {
  type: Date,
  default: null,
},

  },
  { timestamps: true }
);

module.exports = mongoose.model("rides", rideSchema);