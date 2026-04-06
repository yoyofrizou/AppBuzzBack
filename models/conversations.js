const mongoose = require("mongoose");

const conversationSchema = mongoose.Schema(
  {    //tres important : il faut distinguer les discussions selon le trajet, je voulais que la messagerie soit liée au contexte métier
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    driver: {    //je veux savoir clairement car les deux sont users mais avec des roles non interchangeables ici
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    driverName: {    //avoir une donnée prête à afficher, simplifier certains usages UI, évite certaines dépendances fortes au populate
      type: String,
      default: "",
    },

    passengerName: {
      type: String,
      default: "",
    },

    lastMessagePreviewDriver: {    //le conducteur peut voir un aperçu du dernier message adapté à lui, ex : “Un passager vient de réserver”
      type: String,
      default: "",
    },

    lastMessagePreviewPassenger: {
      type: String,
      default: "",
    },

    lastMessageAt: {  //trier les conversations par activité récente
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ ride: 1, driver: 1, passenger: 1 }, { unique: true }); //empêches qu’il y ait deux conversations pour la meme chose, je securise au niveau de la BDD

module.exports = mongoose.model("conversations", conversationSchema);