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

const userSchema = new mongoose.Schema({
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  telephone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  token: { type: String, default: null },

  profilePhoto: { type: String, default: null },
  photos: { type: [String], default: [] },
  car: { type: Object, default: null },

  stripeCustomerId: { type: String, default: null },
  defaultPaymentMethodId: { type: String, default: null },
});

module.exports = mongoose.model("users", userSchema);

 