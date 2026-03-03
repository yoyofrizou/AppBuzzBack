const mongoose = require("mongoose");  //importe Mongoose pour créer des schémas et parler avec MongoDB

// Sous-document Message (imbriqué dans Conversation)
const messageSchema = new mongoose.Schema(    //On crée un schéma appelé messageSchema, ATTENTION ce n est pas une collection car c est un sous document il sert juste à définir la forme des messages
  {
    senderId: {     //celui qui envoie le message
      type: mongoose.Schema.Types.ObjectId,     //son identifiant
      ref: "User",   //dans la collection user
      required: true,     //obligatoire
    },
    text: {      //contenu
      type: String,     // 
      required: true,
      trim: true,    //Si quelqu’un écrit un message mais met plein d’espaces autour, trim nettoie le message en supprimant les espaces
      maxlength: 500,
    },
    createdAt: {     //date du message
      type: Date,
      default: Date.now,   //par defaut le jour meme
    },
  },
  { _id: false } // on ne veux pas que chaque message ait son propre _id car pas besoin, sous-documents simples qui ne sont ni modifiés ni manipulés individuellement
);

// Document principal Conversation
const conversationSchema = new mongoose.Schema(    //schéma principal (collection en base)
  {
    tripId: {    //le trajet concerné par la conversation
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },

    driverId: {    //conducteur de ce trajet
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    passengerId: {       //passager du trajet
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    messages: {
      type: [messageSchema], // chaque élément du tableau suit messageSchema
      default: [],    //vide au depart
    },
  },
  { timestamps: true }    //dans le schema j'ajoute automatiquement les dates de création et de modification
                      //2 champs invisibles dans ton schéma : "createdAt": "2026-03-02T18:00:00.000Z" date de creation de la conversation, "updatedAt": "2026-03-02T18:05:00.000Z" date à laquelle le document a été modifié pour la dernière fois
);

// 1 seule conversation par (trip + passager)
conversationSchema.index({ tripId: 1, passengerId: 1 }, { unique: true });
//Un passager ne peut pas avoir 2 conversations pour le même trip

module.exports = mongoose.model("Conversation", conversationSchema); //crée le modèle Conversation, Mongo va créer une collection appelée conversations 