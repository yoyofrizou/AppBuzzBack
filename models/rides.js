const mongoose = require("mongoose");

const rideSchema = mongoose.Schema({
  departure: String,
  arrival: String,
  date: Date,
  price: String,
  placeAvailable: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "drivers" },
});

const Ride = mongoose.model("rides", rideSchema);

module.exports = Ride;