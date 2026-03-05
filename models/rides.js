const mongoose = require("mongoose");



const rideSchema = mongoose.Schema(
  {
    departure: String,
    arrival: String,
    date: Date,
    price: { type: Number, required: true }, //price en String c'est pas pratique pour calculer, prix par passager fixé par le conducteur

    placesTotal: { type: Number, required: true, min: 1 },
    placesLeft: { type: Number, required: true, min: 0 }, //places en Number (au lieu de String)

    // fixé quand le conducteur crée le ride (c’est le coût total estimé du trajet)
    totalCost: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ["open", "started", "completed", "cancelled"],
      default: "open",
      index: true,
    },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    
  },
  { timestamps: true },
);

rideSchema.index({ status: 1, date: 1 }); //permet à Mongo de trouver rapidement les rides ouverts et les trier par date

const Ride = mongoose.model("rides", rideSchema);

module.exports = Ride;
