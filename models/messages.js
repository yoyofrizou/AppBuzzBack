const mongoose = require("mongoose");

const messageSchema = mongoose.Schema(    //message = élément à l’intérieur de conversation
  {                               //écrit par un utilisateur ou generer par le systeme et visible par tous ou seulement l un ou l autre
    conversation: {   //Chaque message appartient à une conversation
      type: mongoose.Schema.Types.ObjectId,
      ref: "conversations",
      required: true,
      index: true,
    },

    type: {   //distingues deux types : user ou system
      type: String,
      enum: ["system", "user"],
      default: "user",
    },

    sender: {    //utilisateur qui a envoyé le message
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,  //un message système peut ne pas avoir de vrai expéditeur humain donc sender optionnel
    },

    content: {
      type: String,
      required: true,   //un message vide n’a pas d’intérêt
      default: "",
    },

    visibleTo: {  //dit à qui le message est visible
      type: String,
      enum: ["driver_only", "passenger_only", "both"],
      default: "both",
      index: true,  //je peux être amenée à filtrer, permettre des messages système ciblés selon le rôle de l’utilisateur
    },
    readByDriver: {  //Indique si le conducteur a lu le message
  type: Boolean,
  default: false,
},

readByPassenger: {   //Indique si le passager a lu le message
  type: Boolean,
  default: false,
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("messages", messageSchema);