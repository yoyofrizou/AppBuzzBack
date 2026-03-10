const mongoose = require("mongoose");

const rideSchema = mongoose.Schema(
  {
    departure: {
      type: String,
      required: true,
    },

    arrival: {
      type: String,
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    // prix par passager
    price: {
      type: Number,
      required: true,
      min: 1,
    },

    placesTotal: {
      type: Number,
      required: true,
      min: 1,
    },

    placesLeft: {
      type: Number,
      required: true,
      min: 0,
    },

    // coût total estimé du trajet
    totalCost: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ["open", "started", "completed", "cancelled"],
      default: "open",
      index: true,
    },

    // conducteur du trajet
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

rideSchema.index({ status: 1, date: 1 });

const Ride = mongoose.model("rides", rideSchema);

module.exports = Ride;