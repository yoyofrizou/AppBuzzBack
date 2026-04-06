const mongoose = require("mongoose");

const rateSchema = mongoose.Schema({
  //un utilisateur n’est pas évalué pour la même chose selon son rôle
  rating: {
    type: Number,
    required: true,
     min: 1,   //empêcher les valeurs incohérentes comme 0 ou 8
     max: 5,
  },
  comment: {    
    type: String,
    default: "",   //commentaire facultatif
  },
  ride: {   //lié à un trajet précis
    type: mongoose.Schema.Types.ObjectId,
    ref: "rides",
    required: true,
  },
  reviewer: {   //utilisateur qui donne l’avis
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  reviewedUser: {   //utilisateur qui reçoit l’avis
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  reviewerRole: {   //rôle de celui qui note
    type: String,
    enum: ["driver", "passenger"],
    required: true,
  },
  reviewedRole: {   //role de celui qui recoit la note
    type: String,
    enum: ["driver", "passenger"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// empêche doublons
rateSchema.index(
  {
    ride: 1,
    reviewer: 1,
    reviewedUser: 1,
    reviewerRole: 1,
    reviewedRole: 1,
  },
  { unique: true }
);

// perf
rateSchema.index({ reviewedUser: 1, reviewedRole: 1 });  //optimise les recherches de type : tous les avis reçus par cet utilisateur et en tant que quoi
                                                        //Parce que ce sont les requêtes que je fais souvent dans mon controller

module.exports = mongoose.model("rates", rateSchema);