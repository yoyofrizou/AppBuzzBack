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

const driverProfileSchema = mongoose.Schema({
  driverLicenseUrl: { type: String, default: null },      // permis de conduire
  identityDocumentUrl: { type: String, default: null },   // carte d'identité / passeport
  insuranceDocumentUrl: { type: String, default: null },  // assurance

  isProfileComplete: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  telephone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  token: { type: String, default: null },

  profilePhoto: { type: String, default: null },

  car: { type: carSchema, default: null },
  driverProfile: { type: driverProfileSchema, default: {},

  stripeCustomerId: { type: String, default: null },
  defaultPaymentMethodId: { type: String, default: null },

  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
},
});

module.exports = mongoose.model("users", userSchema);