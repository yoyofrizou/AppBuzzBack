var express = require("express");
var router = express.Router();
const Stripe = require("stripe");

const Booking = require("../models/bookings");
const User = require("../models/users");
const Ride = require("../models/rides");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// GET tous les bookings (utile debug)
//
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("passenger", "firstname lastname username email")
      .populate("ride");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// GET les bookings d’un utilisateur passager via son token
//
router.get("/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const bookings = await Booking.find({ passenger: user._id })
      .populate("ride")
      .populate("passenger", "firstname lastname username email");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// POST créer une réservation passager
// Stripe a déjà été appelé avant dans /payments/authorize-payment
//
router.post("/add", async (req, res) => {
  try {
    const {
      token,
      ride: rideId,
      seatsBooked,
      message,
      paymentIntentId,
      maxAmount,
    } = req.body;

    if (!token || !rideId || !paymentIntentId || !maxAmount) {
      return res.json({
        result: false,
        error: "Champs manquants",
      });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    var express = require("express");
var router = express.Router();
const Stripe = require("stripe");

const Booking = require("../models/bookings");
const User = require("../models/users");
const Ride = require("../models/rides");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// GET tous les bookings (utile debug)
//
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("passenger", "firstname lastname username email")
      .populate("ride");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// GET les bookings d’un utilisateur passager via son token
//
router.get("/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const bookings = await Booking.find({ passenger: user._id })
      .populate("ride")
      .populate("passenger", "firstname lastname username email");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// POST créer une réservation passager
// Stripe a déjà été appelé avant dans /payments/authorize-payment
//
router.post("/add", async (req, res) => {
  try {
    const {
      token,
      ride: rideId,
      seatsBooked,
      message,
      paymentIntentId,
      maxAmount,
    } = req.body;

    if (!token || !rideId || !paymentIntentId || !maxAmount) {
      return res.json({
        result: false,
        error: "Champs manquants",
      });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }

    if (ride.status !== "open") {
      return res.json({
        result: false,
        error: "Le trajet n'est plus réservable",
      });
    }

    const parsedSeatsBooked = Number(seatsBooked) || 1;

    if (parsedSeatsBooked <= 0) {
      return res.json({ result: false, error: "Nombre de places invalide" });
    }

    if (ride.placesLeft < parsedSeatsBooked) {
      return res.json({
        result: false,
        error: "Pas assez de places disponibles",
      });
    }

    const existingBooking = await Booking.findOne({
      ride: ride._id,
      passenger: user._id,
    });

    if (existingBooking) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    const newBooking = new Booking({
      message: message || "",
      bookingStatus: "pending",
      paymentStatus: "authorized",
      ride: ride._id,
      passenger: user._id,
      seatsBooked: parsedSeatsBooked,
      maxAmount: Number(maxAmount),
      finalAmount: null,
      paymentIntentId: paymentIntentId,
    });

    const savedBooking = await newBooking.save();

    ride.placesLeft = ride.placesLeft - parsedSeatsBooked;
    await ride.save();

    res.json({
      result: true,
      booking: savedBooking,
      message: "Réservation créée avec succès",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    res.json({
      result: false,
      error: err.message || "Erreur lors de la réservation",
    });
  }
});

//
// DELETE supprimer une réservation
//
router.delete("/delete/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.json({ result: false, error: "Réservation non trouvée" });
    }

    // Si paiement encore seulement autorisé, on annule la préautorisation
    if (booking.paymentIntentId && booking.paymentStatus === "authorized") {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {
        // on évite de tout casser si Stripe renvoie une erreur ici
      }
    }

    const ride = await Ride.findById(booking.ride);
    if (ride) {
      ride.placesLeft = ride.placesLeft + booking.seatsBooked;
      await ride.save();
    }

    await Booking.deleteOne({ _id: req.params.bookingId });

    res.json({
      result: true,
      message: "Réservation supprimée avec succès",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

    const parsedSeatsBooked = Number(seatsBooked) || 1;

    if (parsedSeatsBooked <= 0) {
      return res.json({ result: false, error: "Nombre de places invalide" });
    }

    if (ride.placesLeft < parsedSeatsBooked) {
      return res.json({
        result: false,
        error: "Pas assez de places disponibles",
      });
    }

    const existingBooking = await Booking.findOne({
      ride: ride._id,
      passenger: user._id,
    });

    if (existingBooking) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    const newBooking = new Booking({
      message: message || "",
      bookingStatus: "pending",
      paymentStatus: "authorized",
      ride: ride._id,
      passenger: user._id,
      seatsBooked: parsedSeatsBooked,
      maxAmount: Number(maxAmount),
      finalAmount: null,
      paymentIntentId: paymentIntentId,
    });

    const savedBooking = await newBooking.save();

    ride.placesLeft = ride.placesLeft - parsedSeatsBooked;
    await ride.save();

    res.json({
      result: true,
      booking: savedBooking,
      message: "Réservation créée avec succès",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    res.json({
      result: false,
      error: err.message || "Erreur lors de la réservation",
    });
  }
});

//
// DELETE supprimer une réservation
//
router.delete("/delete/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.json({ result: false, error: "Réservation non trouvée" });
    }

    // Si paiement encore seulement autorisé, on annule la préautorisation
    if (booking.paymentIntentId && booking.paymentStatus === "authorized") {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {
        // on évite de tout casser si Stripe renvoie une erreur ici
      }
    }

    const ride = await Ride.findById(booking.ride);
    if (ride) {
      ride.placesLeft = ride.placesLeft + booking.seatsBooked;
      await ride.save();
    }

    await Booking.deleteOne({ _id: req.params.bookingId });

    res.json({
      result: true,
      message: "Réservation supprimée avec succès",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;