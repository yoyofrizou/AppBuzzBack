const mongoose = require("mongoose");

const rideSchema = mongoose.Schema( //commence le schéma d’un trajet
  {
//un trajet ce n’est pas juste “départ / arrivée”

    departureAddress: { //version humaine de l'adresse avec adresse lisible pour l'affichage
      type: String,
      required: true,
      trim: true,
    },

    destinationAddress: {
      type: String,
      required: true,
      trim: true,
    },

    departureLatitude: { //versions coordonnees exacts pour les calculs
      type: Number,
      required: true,
    },

    departureLongitude: {
      type: Number,
      required: true,
    },

    destinationLatitude: {
      type: Number,
      required: true,
    },

    destinationLongitude: {
      type: Number,
      required: true,
    },

    departureDateTime: {   //pour pouvoir trier, filtrer, comparer dans le temps et gerer les fenetres de recherche
      type: Date,
      required: true,
    },

    pickupWalkMinutes: {   //rend la recherche plus souple
      type: Number,
      default: 0,    //Pour empêcher les valeurs négatives
      min: 0,
    },

    dropoffWalkMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // prix affiché côté UI, en euros, diff de totalcost
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // nombre total de places proposées
    placesTotal: {
      type: Number,
      required: true,
      min: 1,
    },

    // nombre de places restantes, pour pas recalculer a chaque fois
    placesLeft: {
      type: Number,
      required: true,
      min: 0,
    },

    // coût total estimé du trajet, en centimes pour faciliter le calcul
    totalCost: {
      type: Number,
      required: true,
      min: 1,
    },

   status: {   //cycle de vie du trajet
  type: String,
  enum: ["published", "started", "completed", "cancelled", "open"],
  default: "published",        //published et open pourrait en fait etre fusionnes
  index: true,
},

    // conducteur relie a users et pas seulement a driver
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    // ne sert plus vraiment la car driver = user mas peur d'avoir oublie un changement qq part et de faire planter l'appli
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "drivers",
      default: null,
    },

currentLatitude: {  //position actuelle du conducteur pendant le trajet, permet le suivi du trajet côté passager
  type: Number,
  default: null,
},

currentLongitude: {
  type: Number,
  default: null,
},

locationUpdatedAt: {
  type: Date,
  default: null,
},

  },
  { timestamps: true }
);

module.exports = mongoose.model("rides", rideSchema);