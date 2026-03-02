const mongoose = require("mongoose");

const bookingSchema = mongoose.Schema({
  message: String,
  rides: { type: mongoose.Schema.Types.ObjectId, ref: "rides" },
  users: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
});

const Booking = mongoose.model("bookings", bookingSchema);

module.exports = Booking;
