const mongoose = require("mongoose");

const bookingSchema = mongoose.Schema( //objet central de la réservation
  {
   message: {   //peut laisser un message avec sa réservation
            //Pour l’instant son usage est limité, mais il prépare une évolution fonctionnelle. Il permet déjà de stocker de l’information contextuelle sans modifier la structure du modèle
      type: String,
      default: "",
    },

    status: {     //statut du paiement ici pas du trajet car le statut du trajet est dans ride
      type: String,
      enum: ["authorized", "captured", "cancelled"],
      default: "authorized",
      index: true,
    },

    paymentIntentId: {   //identifiant Stripe de la préautorisation
      type: String,
      default: null,
      index: true,
    }, //je peux avoir besoin de retrouver rapidement un booking via son PaymentIntent

    ride: {   //relie la réservation au trajet réservé
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    user: {   //relie la réservation au passager qui l’a faite
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    seatsBooked: {  //indique combien de place ont ete reserve, pour plus tard car pour l instant que 1 max
  type: Number,
  required: true,
  default: 1,
  enum: [1],
  set: () => 1, //même si quelqu’un envoie seatsBooked: 5 → ça devient 1 automatiquement
},

    maxAmount: {   //montant maximum préautorisé
      type: Number,
      required: true,
      min: 1,
    },

    finalAmount: {   //montant réellement capturé à la fin
      type: Number,
      default: null,
      min: 0,
    },

  passengerPresenceStatus: {   //stocke le statut réel de présence du passager
      type: String,
      enum: ["pending", "scanned", "manual", "absent"],
      default: "pending",
      index: true,
    },     //dis pas seulement que j'ai reserve, ca gère la réalité du départ

    //date précise de chaque type d’action pour les 3 prochaines parties
  manualValidatedAt: {
  type: Date,
  default: null,
},
    scannedAt: {
      type: Date,
      default: null,
 },
    absentMarkedAt: {
      type: Date,
      default: null,
 },
    
 //historises l’annulation, 3 prochaines parties, qui a annule, pk et quand?
cancelledBy: {
  type: String,
  enum: ["passenger", "driver", null],
  default: null,
},

cancellationReason: {
  type: String,
  default: null,
},

cancelledAt: {
  type: Date,
  default: null,
},

  },
  { timestamps: true }
);


bookingSchema.index({ ride: 1, user: 1 }, { unique: true }); //Empêche un même utilisateur de réserver deux fois le même trajet
                     //je protège la règle métier directement au niveau base de données avec un index unique pas juste dans la route 

module.exports = mongoose.model("bookings", bookingSchema);

/* const mongoose = require("mongoose");

const bookingSchema = mongoose.Schema(
  {
    message: {
      type: String,
      default: "",
    },

    // statut du passager dans le flow conducteur
    bookingStatus: {
      type: String,
      enum: ["pending", "validated", "absent", "cancelled"],
      default: "pending",
      index: true,
    },

    // statut du paiement Stripe
    paymentStatus: {
      type: String,
      enum: ["authorized", "captured", "cancelled"],
      default: "authorized",
      index: true,
    },

    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
      index: true,
    },

    // passager ayant réservé
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    seatsBooked: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    paymentIntentId: {
      type: String,
      default: null,
    },

    // montant préautorisé
    maxAmount: {
      type: Number,
      required: true,
      min: 1,
    },

    // montant réellement capturé
    finalAmount: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { timestamps: true }
);

// un passager ne peut pas réserver 2 fois le même trajet
bookingSchema.index({ ride: 1, passenger: 1 }, { unique: true });

const Booking = mongoose.model("bookings", bookingSchema);

module.exports = Booking; */