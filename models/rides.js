const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
});

module.exports = mongoose.model("rides", rideSchema);