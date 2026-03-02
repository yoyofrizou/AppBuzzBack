const mongoose = require("mongoose");

const rideSchema = mongoose.Schema({
  departure: String,
  arival: String,
  date: Date,
  price: String,
  placeAvailable: String,
  users: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  //drivers: { type: mongoose.Schema.Types.ObjectId, ref: "drivers" },
});

const Ride = mongoose.model("rides", rideSchema);

module.exports = Ride;