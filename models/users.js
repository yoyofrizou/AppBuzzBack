const mongoose = require("mongoose");

const carSchema = mongoose.Schema({
  brand: String,
  color: String,
  model: String,
  nbSeats: Number,
  licencePlate: {
    type: String,
    uppercase: true,
    trim: true,
  },
});

const userSchema = mongoose.Schema({
  firstname: String,
  lastname: String,
  username: {
    type: String,
    unique: true, // empêche deux comptes avec le même username
  },
  password: String,
  email: String,
  token: String,

  // Stripe
  stripeCustomerId: {
    type: String,
    default: null,
  },
  defaultPaymentMethodId: {
    type: String,
    default: null,
  },

  car: {
    type: carSchema,
    default: null,
  },

  photos: {
    type: [String],
    default: [], // évite les bugs quand tu fais push sur photos
  },
});

const User = mongoose.model("users", userSchema);

module.exports = User;