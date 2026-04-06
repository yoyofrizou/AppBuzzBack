const mongoose = require("mongoose");

const carSchema = mongoose.Schema({ //sous schema pour la voiture, infos regroupées dans un bloc logique car
  brand: String,
  color: String,
  model: String,
  nbSeats: Number,
  licencePlate: { //donnée sensible d’identification, donc format propre et cohérent
    type: String,
    uppercase: true, //enlever les espaces inutiles
    trim: true, //uniformiser l’écriture
  },

  //les 4 prochaines parties stockent les notes moyennes et le nombre de notes
  driverAverageRating: {
  type: Number,
  default: 0,
},

driverRatingsCount: {
  type: Number,
  default: 0,
},

passengerAverageRating: {
  type: Number,
  default: 0,
},

passengerRatingsCount: {
  type: Number,
  default: 0,
},
});

const driverProfileSchema = mongoose.Schema({ //deuxième sous-schéma : pour le profil conducteur
  driverLicenseUrl: { type: String, default: null },    
  identityDocumentUrl: { type: String, default: null }, 
  insuranceDocumentUrl: { type: String, default: null },  
// stocke les URLs des documents conducteur, ne stocke pas le fichier lui-même dans MongoDB, seulement son URL Cloudinary
  isProfileComplete: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({  //schema principal de l'utilisateur
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  telephone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  token: { type: String, default: null }, //authentifier l’utilisateur sans lui redemander son mot de passe à chaque requête

  profilePhoto: { type: String, default: null }, //l'URL de la photo de profil

  car: { type: carSchema, default: null }, //un utilisateur peut devenir conducteur, mais n’a pas forcément une voiture dès l’inscription
                             // null car un passager n’a pas besoin de voiture
  
  driverProfile: { //ajoute le bloc profil conducteur
    type: driverProfileSchema,
    default: {}, //Pour que l’objet existe même si rien n’a encore été renseigné pour eviter “driverProfile undefined”
  },

  stripeCustomerId: { type: String, default: null },
  defaultPaymentMethodId: { type: String, default: null },
//relier mon compte local au compte Stripe du client

  resetPasswordToken: { type: String, default: null },   //un token temporaire
  resetPasswordExpires: { type: Date, default: null },   //une date d’expiration
});  //système de réinitialisation sécurisé

module.exports = mongoose.model("users", userSchema);

//jai préféré un seul utilisateur multi-rôle car dans mon application une même personne peut être passager et conducteur selon le contexte