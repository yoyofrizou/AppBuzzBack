const express = require("express");
const router = express.Router();

const Ride = require("../models/rides");
const User = require("../models/users");
const Booking = require("../models/bookings");
const Review = require("../models/reviews");

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// 1. Publier un trajet
//
router.post("/create", async (req, res) => {
  try {
    const {
      token,
      departure,
      arrival,
      date,
      price,
      placesTotal,
      totalCost,
    } = req.body;

    if (
      !token ||
      !departure ||
      !arrival ||
      !date ||
      !price ||
      !placesTotal ||
      !totalCost
    ) {
      return res.json({
        result: false,
        error: "Remplir tous les champs",
      });
    }

    const driver = await User.findOne({ token });
    if (!driver) {
      return res.json({ result: false, error: "Conducteur non trouvé" });
    }

    const parsedPrice = Number(price);
    const parsedPlacesTotal = Number(placesTotal);
    const parsedTotalCost = Number(totalCost);

    if (parsedPrice <= 0 || parsedPlacesTotal <= 0 || parsedTotalCost <= 0) {
      return res.json({
        result: false,
        error: "Valeurs invalides",
      });
    }

    const newRide = new Ride({
      departure,
      arrival,
      date: new Date(date),
      price: parsedPrice,
      placesTotal: parsedPlacesTotal,
      placesLeft: parsedPlacesTotal,
      totalCost: parsedTotalCost,
      status: "open",
      driver: driver._id,
    });

    const savedRide = await newRide.save();

    res.json({
      result: true,
      ride: savedRide,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 2. Rechercher les trajets côté passager
//
router.get("/search", async (req, res) => {
  try {
    const { departure, arrival, date } = req.query;

    const query = {
      status: "open",
      placesLeft: { $gt: 0 },
    };

    if (departure) {
      query.departure = new RegExp(departure, "i");
    }

    if (arrival) {
      query.arrival = new RegExp(arrival, "i");
    }

    if (date) {
      query.date = new Date(date);
    }

    const rides = await Ride.find(query)
      .populate("driver", "firstname lastname username car")
      .sort({ date: 1 });

    res.json({
      result: true,
      rides,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 3. Récupérer les trajets du conducteur
//
router.get("/driver/:token", async (req, res) => {
  try {
    const driver = await User.findOne({ token: req.params.token });

    if (!driver) {
      return res.json({ result: false, error: "Conducteur non trouvé" });
    }

    const proposedRides = await Ride.find({
      driver: driver._id,
      status: { $in: ["open", "started"] },
    }).sort({ date: 1 });

    const pastRides = await Ride.find({
      driver: driver._id,
      status: { $in: ["completed", "cancelled"] },
    }).sort({ date: -1 });

    res.json({
      result: true,
      proposedRides,
      pastRides,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 4. Récupérer les détails d’un trajet + ses réservations
//
router.get("/:rideId/bookings", async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId).populate(
      "driver",
      "firstname lastname username car"
    );

    if (!ride) {
      return res.json({ result: false, error: "Trajet introuvable" });
    }

    const bookings = await Booking.find({ ride: ride._id })
      .populate("passenger", "firstname lastname username email photos")
      .sort({ createdAt: 1 });

    res.json({
      result: true,
      ride,
      bookings,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 5. Marquer un passager comme validé
//
router.post("/bookings/validate", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.json({ result: false, error: "bookingId manquant" });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.json({ result: false, error: "Booking introuvable" });
    }

    booking.bookingStatus = "validated";
    await booking.save();

    res.json({
      result: true,
      booking,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 6. Marquer un passager absent
//
router.post("/bookings/absent", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.json({ result: false, error: "bookingId manquant" });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.json({ result: false, error: "Booking introuvable" });
    }

    booking.bookingStatus = "absent";
    await booking.save();

    res.json({
      result: true,
      booking,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 7. Démarrer le trajet
// -> capture les validés
// -> annule les absents
//
router.post("/start", async (req, res) => {
  try {
    const { rideId } = req.body;

    if (!rideId) {
      return res.json({ result: false, error: "rideId manquant" });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.json({ result: false, error: "Trajet introuvable" });
    }

    if (ride.status !== "open") {
      return res.json({ result: false, error: "Trajet non démarrable" });
    }

    const bookings = await Booking.find({ ride: ride._id });

    if (bookings.length === 0) {
      return res.json({ result: false, error: "Aucun passager" });
    }

    const allProcessed = bookings.every(
      (booking) =>
        booking.bookingStatus === "validated" ||
        booking.bookingStatus === "absent"
    );

    if (!allProcessed) {
      return res.json({
        result: false,
        error: "Tous les passagers ne sont pas encore traités",
      });
    }

    for (const booking of bookings) {
      if (
        booking.bookingStatus === "validated" &&
        booking.paymentIntentId &&
        booking.paymentStatus === "authorized"
      ) {
        await stripe.paymentIntents.capture(booking.paymentIntentId);

        booking.paymentStatus = "captured";
        booking.finalAmount = booking.maxAmount;
        await booking.save();
      }

      if (
        booking.bookingStatus === "absent" &&
        booking.paymentIntentId &&
        booking.paymentStatus === "authorized"
      ) {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);

        booking.paymentStatus = "cancelled";
        await booking.save();
      }
    }

    ride.status = "started";
    await ride.save();

    res.json({
      result: true,
      message: "Trajet démarré",
      ride,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 8. Terminer le trajet
//
router.post("/complete", async (req, res) => {
  try {
    const { rideId } = req.body;

    if (!rideId) {
      return res.json({ result: false, error: "rideId manquant" });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.json({ result: false, error: "Trajet introuvable" });
    }

    ride.status = "completed";
    await ride.save();

    res.json({
      result: true,
      message: "Trajet terminé",
      ride,
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

//
// 9. Envoyer les évaluations
//
router.post("/reviews/create", async (req, res) => {
  try {
    const { token, rideId, reviews } = req.body;

    if (!token || !rideId || !reviews || !Array.isArray(reviews)) {
      return res.json({ result: false, error: "Champs manquants" });
    }

    const reviewer = await User.findOne({ token });
    if (!reviewer) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    // 🔴 Vérifier que le trajet existe
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.json({ result: false, error: "Trajet introuvable" });
    }

    // 🔴 Vérifier que le trajet est terminé
    if (ride.status !== "completed") {
      return res.json({
        result: false,
        error: "Le trajet doit être terminé avant évaluation",
      });
    }

    // Création des reviews
    for (const item of reviews) {
      const review = new Review({
        ride: rideId,
        reviewer: reviewer._id,
        reviewedUser: item.reviewedUserId,
        rating: item.rating,
        comment: item.comment || "",
      });

      await review.save();
    }

    res.json({
      result: true,
      message: "Évaluations enregistrées",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});
//
// 10. Supprimer un trajet
//
router.delete("/delete/:rideId", async (req, res) => {
  try {
    const result = await Ride.deleteOne({ _id: req.params.rideId });

    if (result.deletedCount > 0) {
      res.json({ result: true, message: "Trajet supprimé" });
    } else {
      res.json({ result: false, error: "Trajet non trouvé" });
    }
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;