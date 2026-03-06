const mongoose = require('mongoose');

const bookingSchema = mongoose.Schema({
  message: String,
  status: {
      type: String,
      enum: ["authorized", "captured", "cancelled"],
      default: "authorized",
      index: true,
    },
    //lien vers ride + user
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "rides", index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },

  // nombre de places réservées
  seatsBooked: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
 // paiement Stripe
  paymentIntentId: {
    type: String,
    default: null
  },

  // montant préautorisé (hold)
  maxAmount: {
    type: Number,
    required: true,
    min: 1
  },

  // montant réellement débité à la fin
  finalAmount: {
    type: Number,
    default: null,
    min: 0
  }
},
{ timestamps: true }
);

// pas possible pour un user de réserver 2 fois le même ride
bookingSchema.index({ ride: 1, user: 1 }, { unique: true });

const Booking = mongoose.model("bookings", bookingSchema);

module.exports = Booking;
