const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const Booking = require("../models/bookings");
const User = require("../models/users");
const Ride = require("../models/rides");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// GET tous les bookings (debug)
//
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user", "firstname lastname username email")
      .populate("ride");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// GET les bookings de l'utilisateur connecté via son token
//
router.get("/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const bookings = await Booking.find({ user: user._id })
      .populate("ride")
      .populate("user", "firstname lastname username email")
      .sort({ createdAt: -1 });

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// POST créer une réservation
// Stripe a déjà été appelé avant dans /payments/authorize-payment
// ou /payments/authorize-payment-onetime
//
router.post("/add", async (req, res) => {
  try {
    const {
      token,
      ride: rideId,
      seatsBooked = 1,
      message = "",
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
      return res.json({
        result: false,
        error: "Nombre de places invalide",
      });
    }

    if (ride.placesLeft < parsedSeatsBooked) {
      return res.json({
        result: false,
        error: "Pas assez de places disponibles",
      });
    }

    const existingBooking = await Booking.findOne({
      ride: ride._id,
      user: user._id,
    });

    if (existingBooking) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    const newBooking = new Booking({
      message,
      status: "authorized",
      ride: ride._id,
      user: user._id,
      seatsBooked: parsedSeatsBooked,
      maxAmount: Number(maxAmount),
      finalAmount: null,
      paymentIntentId,
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
      return res.json({
        result: false,
        error: "Réservation non trouvée",
      });
    }

    // Si la préautorisation existe encore, on l'annule
    if (booking.paymentIntentId && booking.status === "authorized") {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {
        // On évite de casser la suppression si Stripe échoue ici
      }
    }

    const ride = await Ride.findById(booking.ride);
    if (ride) {
      ride.placesLeft = ride.placesLeft + booking.seatsBooked;
      await ride.save();
    }

    booking.status = "cancelled";
    await booking.save();

    res.json({
      result: true,
      message: "Réservation annulée avec succès",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;