const mongoose = require("mongoose"); // pour créer un schéma MongoDB pour les paiements

const paymentSchema = new mongoose.Schema( //définis ici la forme exacte d’un paiement : infos, type, obligatoire ou non
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,   //ObjectId : lien vers un document MongoDB
      ref: "users",   //pointe vers la collection des utilisateurs
      required: true, //obligatoire
    },       //lié chaque paiement à l’utilisateur payeur pour garder une traçabilité

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },     //permet ensuite de retrouver tous les paiements liés à un conducteur, calculer ce qu'il doit toucher et gere l'historique

    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rides",
      required: true,
    }, //un paiement correspond à une réservation sur un trajet

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookings",
      default: null, //Parce qu’au moment de certains traitements, je peux ne pas encore avoir ce lien, ou vouloir le laisser optionnel.
    },      //réservation et paiement sont très liés.

    provider: {    //indique quel service de paiement j'utilise car eventuellement un autre que stripe plus tard
      type: String,
      enum: ["stripe"],
      default: "stripe",
    },

    paymentIntentId: {  //identifiant stripe du paiement, le PaymentIntent est l’objet central
      type: String,
      required: true,
      unique: true,
    }, //J’ai stocké le paymentIntentId comme identifiant principal côté Stripe pour synchroniser précisément ma base et Stripe

    chargeId: { //identifiant de la charge : une fois capturé, Stripe peut créer un chargeId
      type: String,
      default: null,
    },

    transferId: {  //prévu si plus tard je transfère de l’argent au conducteur
      type: String,
      default: null,
    },

    refundId: {  //Si un paiement est remboursé, tu peux garder la trace
      type: String,
      default: null,
    },

    amount: { //en centimes
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "eur",
    },

    platformFee: { //J’ai prévu la commission plateforme dès le modèle pour distinguer clairement la répartition du paiement
      type: Number,
      default: 0,
    },

    driverAmount: { //Montant qui revient au conducteur
      type: Number,
      default: 0,
    },

    seatsBooked: {
      type: Number,
      default: 1,
    },

    paymentMethod: { //je laisses la porte ouverte à Apple Pay / Google Pay amis la je n ai ps eu le temps de voir comment ca focntionne
      type: String,
      enum: ["card", "apple_pay", "google_pay", "unknown"],
      default: "card",
    },

    status: {  //etat du paiement 
      type: String,
      enum: [
        "pending",
        "requires_payment_method",
        "requires_action",
        "paid",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
    },   //un paiement a un cycle de vie réel, ici mon modèle Payment est plus orienté transaction Stripe générale car le reste est dans booking

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    metadata: { //pour stocker des informations complémentaires sans rigidifier excessivement le schéma
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, //pour tracer automatiquement la création et la mise à jour des paiements, ca ajoute automatiquement createdAt et updatedAt
  }
);

const Payment = mongoose.model("payments", paymentSchema);  //creation du modele MongoDB payment

module.exports = Payment; //je l'exporte pour l'utiliser ailleurs 