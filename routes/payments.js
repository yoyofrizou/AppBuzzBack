const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const User = require("../models/users");

/*const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

// 1) Créer SetupIntent + EphemeralKey (pour PaymentSheet)
router.post("/setup-intent", async (req, res) => {
  try {
    const { token } = req.body;

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "Utilisateur non trouvé" });

    // customer stripe
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
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

// 2) Après PaymentSheet OK : récupérer paymentMethodId depuis le SetupIntent
router.post("/attach-default-payment-method", async (req, res) => {
  try {
    const { token, setupIntentId } = req.body;

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "Utilisateur non trouvé" });

    if (!user.stripeCustomerId) {
      return res.json({ result: false, error: "Customer Stripe manquant" });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;

    if (!paymentMethodId) {
      return res.json({ result: false, error: "payment_method introuvable dans SetupIntent" });
    }

    // attacher au customer (au cas où)
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // mettre par défaut
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    user.defaultPaymentMethodId = paymentMethodId;
    await user.save();

    res.json({ result: true, message: "Carte enregistrée et définie par défaut" });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 3) Préautorisation (PaymentIntent manual capture)
router.post("/authorize", async (req, res) => {
  try {
    const { token, maxAmount, metadata } = req.body;

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "Utilisateur non trouvé" });

    if (!user.stripeCustomerId || !user.defaultPaymentMethodId) {
      return res.json({ result: false, error: "Aucune carte enregistrée" });
    }

    const pi = await stripe.paymentIntents.create({
      amount: maxAmount, // centimes
      currency: "eur",
      customer: user.stripeCustomerId,
      payment_method: user.defaultPaymentMethodId,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      metadata: metadata || {},
    });

    res.json({ result: true, paymentIntentId: pi.id, status: pi.status });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 4) Capture partielle au montant final
router.post("/capture", async (req, res) => {
  try {
    const { paymentIntentId, amountToCapture } = req.body;

    const captured = await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: amountToCapture,
    });

    res.json({ result: true, status: captured.status });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});

// 5) Annuler une préautorisation
router.post("/cancel", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);
    res.json({ result: true, status: cancelled.status });
  } catch (err) {
    res.json({ result: false, error: err.message });
  }
});*/

module.exports = router;