const express = require("express"); //importe express pour creer un router 
const router = express.Router(); // cree un router dedier au paiement
const Stripe = require("stripe"); //import de la libraire Stripe pour parler à l’API Stripe depuis mon backend
const User = require("../models/users");    //j'importe les modele necessaires, user pour retrouver le client et ses infos stripe
const Booking = require("../models/bookings"); //pour l historique et les liens resa/paiement
const connectDB = require("../config/connectDB");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {   //pour initialiser Stripe
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    return res.status(500).json({
      result: false,
      error: "Connexion base de données impossible.",
    });
  }
});

router.get("/", async (req, res) => {   //route test pour voir si /payments fonctionne, verif que le router est branche
  res.json({
    result: true,
    message: "payments route is working",
  });
});

// 1) SetupIntent + EphemeralKey pour enregistrer une carte
router.post("/setup-intent", async (req, res) => { //préparer l’enregistrement d’une carte
try {
    const { token } = req.body;  //trouver le user connecte enr recuperant le token

    const user = await User.findOne({ token }); //cherche l'utilisateur correspondant pour rattacher la carte
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    } //si pas d’utilisateur, on arrête

    if (!user.stripeCustomerId) {   //vérifie si l’utilisateur a déjà un customer Stripe, Stripe a besoin d’un objet customer pour enregistrer des cartes
      const customer = await stripe.customers.create({ //si y en a pas je le cree en envoyant email nom et un metadata avec le userId
        email: user.email || undefined,
        name:
          user.prenom && user.nom
            ? `${user.prenom} ${user.nom}`
            : undefined,
        metadata: { userId: String(user._id) },
      });

      user.stripeCustomerId = customer.id;   
      await user.save(); //sauvegarde l'Id stripe dans mon user MongoDB
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: user.stripeCustomerId },
      { apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16" }
    );   //cree une cle temporaire stripe , sert au frontend mobile pour accéder de manière sécurisée à certaines opérations Stripe liées au customer

    const setupIntent = await stripe.setupIntents.create({ //sert à enregistrer une carte pour plus tard
      customer: user.stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",  //sans que le client ressaisisse tout à chaque fois
    });

    res.json({
      result: true,
      customerId: user.stripeCustomerId,
      ephemeralKeySecret: ephemeralKey.secret,
      setupIntentClientSecret: setupIntent.client_secret,
    }); //renvoies au frontend tout ce dont il a besoin pour finaliser l’enregistrement de carte côté mobile
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 2) Définir la carte comme carte par défaut
router.post("/attach-default-payment-method", async (req, res) => { //définir la carte enregistrée comme carte par défaut
  try {
    const { token, setupIntentId } = req.body; //je recup le user et le setupIntent

    const user = await User.findOne({ token }); //j'identifie le user
    if (!user) {    //Impossible de rattacher une carte si le customer Stripe n’existe pas
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    if (!user.stripeCustomerId) {
      return res.json({ result: false, error: "Customer Stripe manquant" });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);   //vas chercher le SetupIntent chez Stripe pour récupérer le payment_method qui a été créé

    if (setupIntent.customer !== user.stripeCustomerId) {  //Pour éviter qu’un utilisateur attache une carte qui ne lui appartient pas
      return res.json({
        result: false,
        error: "Ce SetupIntent n'appartient pas à cet utilisateur",
      });
    }

    const paymentMethodId = setupIntent.payment_method;   //récupères l’identifiant de la carte

    if (!paymentMethodId) {
      return res.json({
        result: false,
        error: "payment_method introuvable dans SetupIntent",
      });
    }

    try {   //try/catch car parfois elle est déjà attachée, et jeveux éviter que ça casse pour rien
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });
    } catch (err) {
      if (!String(err.message || "").toLowerCase().includes("already")) {
        throw err;
      }
    }    //attache la carte au customer Stripe

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });    //définis cette carte comme carte par défaut chez Stripe

    user.defaultPaymentMethodId = paymentMethodId;
    await user.save();    //je garde cette info aussi dans ma base locale, pour retrouver plus vite la carte par défaut sans tout redemander à Stripe

    res.json({
      result: true,
      message: "Carte enregistrée et définie par défaut",
      defaultPaymentMethodId: paymentMethodId,  //je confirme l’opération au frontend
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});  

// 3) Récupérer les cartes enregistrees du user
router.get("/payment-methods/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });  //identifie l'utilisateur
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    if (!user.stripeCustomerId) {
      return res.json({
        result: true,
        cards: [],
        defaultPaymentMethodId: null,
      });    //Si le user n’a pas encore de customer Stripe, il n’a pas de cartes enregistrées
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });   //demande à Stripe la liste des cartes

    const cards = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "",
      last4: pm.card?.last4 || "",
      expMonth: pm.card?.exp_month || null,
      expYear: pm.card?.exp_year || null,
    }));     //transformes la réponse Stripe en format simple pour le frontend car pas besoin de toute la reponse stripe brute

    res.json({
      result: true,
      cards,
      defaultPaymentMethodId: user.defaultPaymentMethodId || null,
    });   // j'envoie la liste et dis laquelle est par defaut 
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 4) Préautorisation avec carte par défaut
router.post("/authorize-payment", async (req, res) => {
  try {
    const { token, maxAmount, metadata } = req.body;    //recup utilisatuer, montant max a autoriser et infos contextuelles n importe 

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    if (!user.stripeCustomerId || !user.defaultPaymentMethodId) {
      return res.json({ result: false, error: "Aucune carte enregistrée" });
    }   //vérifies qu’il a bien une carte par défaut

    if (!maxAmount || Number(maxAmount) <= 0) {
      return res.json({ result: false, error: "Montant invalide" });
    }  //Validation simple du montant

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(maxAmount),
      currency: "eur",
      customer: user.stripeCustomerId,
      payment_method: user.defaultPaymentMethodId,
      capture_method: "manual",
      confirm: true,
      off_session: true,   //paiement sans interaction immédiate de l’utilisateur
      metadata: metadata || {},
    });    //crées un PaymentIntent, ce qu’il fallait pour mon modèle de prix dégressif

    res.json({
      result: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    }); //renvoies l’id Stripe et le statut pour que le frontend et le backend puissent suivre la suite
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 5) Préautorisation one-shot
router.post("/authorize-payment-onetime", async (req, res) => { //pareil mais pour une carte non enregistree
  try {
    const { token, maxAmount, currency, metadata } = req.body;

    if (!token || !maxAmount || Number(maxAmount) <= 0) {
      return res.json({
        result: false,
        error: "Champs manquants ou montant invalide",
      });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const paymentIntent = await stripe.paymentIntents.create({ //crée le PaymentIntent sans customer ni carte par défaut
      amount: Number(maxAmount),
      currency: currency || "eur",
      capture_method: "manual",
      automatic_payment_methods: { //Stripe peut gérer automatiquement les moyens compatibles
        enabled: true,
      },
      metadata: metadata || {},
    });

    res.json({
      result: true,
      paymentIntentClientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    }); //renvoies le client_secret nécessaire au frontend pour finaliser le paiement
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 6) Capture finale
router.post("/capture-payment", async (req, res) => {
  try {
    const { paymentIntentId, amountToCapture } = req.body;  //recup quel paiement capturer et evetuellemt pour quel montant final

    if (!paymentIntentId) {
      return res.json({ result: false, error: "paymentIntentId manquant" });
    }

    const options = {};
    if (amountToCapture) {
      options.amount_to_capture = Number(amountToCapture);
    }    //construis dynamiquement les options de capture, tout ou le max autorise

    const captured = await stripe.paymentIntents.capture(
      paymentIntentId,
      options    //demande à Stripe de prélever réellement
    );

    res.json({
      result: true,
      status: captured.status,   //renvoie le statut final
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 7) Annuler la préautorisation
router.post("/cancel-payment", async (req, res) => { //annuler un PaymentIntent avant capture
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.json({ result: false, error: "paymentIntentId manquant" });
    }

    const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);

    res.json({
      result: true,
      status: cancelled.status,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 8) Historique paiements du passager
router.get("/history/:token", async (req, res) => {   //Route pour afficher l’historique
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const bookings = await Booking.find({
      user: user._id,
      status: "captured",
    })  // prends les bookings capturés, donc réellement payés
    //Ça montre que dans ton architecture actuelle, la vérité paiement finale est surtout portée par Booking plutôt que par Payment
      .populate({
        path: "ride",
        select: "departureAddress destinationAddress",
      }) //ca ajoute les infos du trajet et tu tries du plus récent au plus ancien
      .sort({ updatedAt: -1 });

    const history = bookings.map((booking) => {    //transformes les bookings en données simples pour le front
      const departure =
        booking?.ride?.departureAddress || "Point de départ";
      const destination =
        booking?.ride?.destinationAddress || "Destination";

      return {
        _id: String(booking._id),
        title: `${departure} → ${destination}`,
        amount: booking.finalAmount || booking.maxAmount || 0,
        date: booking.updatedAt,
      }; //Le frontend reçoit directement des données prêtes à afficher
    });

    res.json({
      result: true,
      history,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;