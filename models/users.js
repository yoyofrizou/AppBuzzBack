const mongoose = require('mongoose');

 const carSchema = mongoose.Schema({
 brand: String,
 color: String,
 model: String,
 nbSeats: Number,
 licencePlate: { 
    type: String, 
    uppercase: true, // Transforme automatiquement "ab-123-cd" en "AB-123-CD"
    trim: true      // Enlève les espaces inutiles avant ou après
 }
});


const userSchema = mongoose.Schema({
  firstname: String,
  lastname: String,
  username: String,
  password: String,
  email: String,
  token: String,
  car: carSchema,
  photos: [String], // pour upload les photos
});

const User = mongoose.model('users', userSchema);

module.exports = User;