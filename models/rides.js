const mongoose = require("mongoose");

const rideSchema = mongoose.Schema({
  departure: String,
  arrival: String,
  date: Date,
  price: String,   //price en String c'est pas pratique pour calculer

  placesTotal: { type: Number, required: true, min: 1 },
  placesLeft: { type: Number, required: true, min: 0 },   //places en Number (au lieu de String)

  // fixé quand le conducteur crée le ride (c’est le coût total estimé du trajet)
    totalCost: { type: Number, required: true, min: 1 },

   status: {
      type: String,
      enum: ["open", "started", "completed", "cancelled"],
      default: "open",
      index: true,
    },

<<<<<<< HEAD
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  // driver: { type: mongoose.Schema.Types.ObjectId, ref: "drivers" },
=======
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "drivers", index: true, },
>>>>>>> d1187c170e1b9d9fb81422d30637f343a8ed57d0
},
{ timestamps: true }
);

rideSchema.index({ status: 1, date: 1 });    //permet à Mongo de trouver rapidement les rides ouverts et les trier par date

const Ride = mongoose.model("rides", rideSchema);

module.exports = Ride;