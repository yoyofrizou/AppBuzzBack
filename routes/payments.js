const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const User = require("../models/users");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

// 1) SetupIntent + EphemeralKey pour enregistrer une carte dans le profil
router.post("/setup-intent", async (req, res) => {
  try {
    const { token } = req.body;

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "Utilisateur non trouvé" });

    // customer stripe
     if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name:
          user.firstname && user.lastname
            ? `${user.firstname} ${user.lastname}`
            : undefined,
        metadata: { userId: String(user._id) },
      });

      user.stripeCustomerId = customer.id;
      await user.save();
    }

    // ephemeral key requis pour PaymentSheet
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: user.stripeCustomerId },
      { apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16" }
    );

     // SetupIntent pour enregistrer la carte
    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session", // important: futur paiement sans ouvrir sheet
    });

    res.json({
      result: true,
      customerId: user.stripeCustomerId,
      ephemeralKeySecret: ephemeralKey.secret,
      setupIntentClientSecret: setupIntent.client_secret,
    });
   } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 2) Par defaut
router.post("/attach-default-payment-method", async (req, res) => {
  try {
    const { token, setupIntentId } = req.body;

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "Utilisateur non trouvé" });

    if (!user.stripeCustomerId) {
      return res.json({ result: false, error: "Customer Stripe manquant" });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.customer !== user.stripeCustomerId) {
      return res.json({
        result: false,
        error: "Ce SetupIntent n'appartient pas à cet utilisateur",
      });
    }

    const paymentMethodId = setupIntent.payment_method;

    if (!paymentMethodId) {
      return res.json({ result: false, error: "payment_method introuvable dans SetupIntent" });
    }

    // Attacher au customer si besoin
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });
    } catch (err) {
      // Si déjà attaché, on laisse passer
      if (!err.message.toLowerCase().includes("already")) {
        throw err;
      }
    }

    // mettre par défaut
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    user.defaultPaymentMethodId = paymentMethodId;
    await user.save();

  res.json({
      result: true,
      message: "Carte enregistrée et définie par défaut",
      defaultPaymentMethodId: paymentMethodId,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 3) Récupérer la carte par défaut / les infos utiles
router.get("/payment-methods/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    if (!user.stripeCustomerId) {
      return res.json({ result: true, cards: [], defaultPaymentMethodId: null });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });

    const cards = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "",
      last4: pm.card?.last4 || "",
      expMonth: pm.card?.exp_month || null,
      expYear: pm.card?.exp_year || null,
    }));

    res.json({
      result: true,
      cards,
      defaultPaymentMethodId: user.defaultPaymentMethodId || null,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 4) Préautorisation / hold
router.post("/authorize-payment", async (req, res) => {
  try {
    const { token, maxAmount, metadata } = req.body;

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    if (!user.stripeCustomerId || !user.defaultPaymentMethodId) {
      return res.json({ result: false, error: "Aucune carte enregistrée" });
    }

    if (!maxAmount || maxAmount <= 0) {
      return res.json({ result: false, error: "Montant invalide" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: maxAmount,
      currency: "eur",
      customer: user.stripeCustomerId,
      payment_method: user.defaultPaymentMethodId,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      metadata: metadata || {},
    });

    res.json({
      result: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 5) Préautorisation one-shot sans enregistrer la carte
router.post("/authorize-payment-onetime", async (req, res) => {
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(maxAmount),
      currency: currency || "eur",
      capture_method: "manual",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: metadata || {},
    });

    res.json({
      result: true,
      paymentIntentClientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 6) Capture
router.post("/capture-payment", async (req, res) => {
  try {
    const { paymentIntentId, amountToCapture } = req.body;

    if (!paymentIntentId) {
      return res.json({ result: false, error: "paymentIntentId manquant" });
    }

    const options = {};
    if (amountToCapture) {
      options.amount_to_capture = Number(amountToCapture);
    }

    const captured = await stripe.paymentIntents.capture(
      paymentIntentId,
      options
    );

    res.json({
      result: true,
      status: captured.status,
    });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 6) Annuler une préautorisation
router.post("/cancel-payment", async (req, res) => {
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

// 7) historique versements
router.get("/history/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    // Pour l'instant on prend les bookings capturés du passager
    // Tu pourras plus tard distinguer "versements reçus" conducteur / "paiements effectués" passager
    const Booking = require("../models/bookings");

    const bookings = await Booking.find({
      passenger: user._id,
      paymentStatus: "captured",
    })
      .populate("ride")
      .sort({ updatedAt: -1 });

    const history = bookings.map((booking) => ({
      id: booking._id,
      title: booking.ride
        ? `${booking.ride.departure} → ${booking.ride.arrival}`
        : "Trajet",
      amount: booking.finalAmount || booking.maxAmount || 0,
      date: booking.updatedAt,
    }));

    res.json({
      result: true,
      history,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;