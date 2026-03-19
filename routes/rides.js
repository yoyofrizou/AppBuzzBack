const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const Ride = require("../models/rides");
const Booking = require("../models/bookings");
const ridesController = require("../controllers/rides");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// POST créer un trajet
//
router.post("/create", ridesController.createRide);

//
// GET trajets disponibles
//
router.get("/available", async (req, res) => {
  try {
    const now = new Date();

    const rides = await Ride.find({
      departureDateTime: { $gte: now },
      placesLeft: { $gt: 0 },
      status: { $in: ["published", "open"] },
    })
      .populate(
        "user",
        "firstname lastname prenom nom username profilePhoto car"
      )
      .sort({ departureDateTime: 1 });

    return res.json({
      result: true,
      rides,
    });
  } catch (error) {
    console.error("GET /rides/available error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// GET recherche de trajets
//
router.get("/search", async (req, res) => {
  try {
    const departure = req.query.departure?.trim() || "";
    const destination = req.query.destination?.trim() || "";
    const dateTime = req.query.dateTime?.trim() || "";
    const pickupWalkMinutes = Number(req.query.pickupWalkMinutes) || 0;
    const dropoffWalkMinutes = Number(req.query.dropoffWalkMinutes) || 0;

    if (!departure || !destination) {
      return res.json({
        result: false,
        error: "Les champs départ et destination sont obligatoires.",
      });
    }

    const filters = {
      $and: [
        {
          departureAddress: { $regex: departure, $options: "i" },
        },
        {
          destinationAddress: { $regex: destination, $options: "i" },
        },
        {
          placesLeft: { $gt: 0 },
        },
        {
          status: { $in: ["published", "open"] },
        },
      ],
    };

    if (dateTime) {
      const requestedDate = new Date(dateTime);

      if (!Number.isNaN(requestedDate.getTime())) {
        const startWindow = new Date(requestedDate.getTime() - 15 * 60 * 1000);
        const endWindow = new Date(requestedDate.getTime() + 15 * 60 * 1000);

        filters.$and.push({
          departureDateTime: {
            $gte: startWindow,
            $lte: endWindow,
          },
        });
      }
    } else {
      filters.$and.push({
        departureDateTime: { $gte: new Date() },
      });
    }

    const rides = await Ride.find(filters)
      .populate(
        "user",
        "firstname lastname prenom nom username profilePhoto car"
      )
      .sort({ departureDateTime: 1 });

    return res.json({
      result: true,
      rides,
      searchMeta: {
        departure,
        destination,
        dateTime,
        pickupWalkMinutes,
        dropoffWalkMinutes,
      },
    });
  } catch (error) {
    console.error("GET /rides/search error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// GET mes trajets en tant que conducteur
//
router.get("/driver/:token", ridesController.getDriverTrips);

//
// GET réservations passager
//
router.get("/passenger-bookings/:token", ridesController.getPassengerBookings);

//
// POST scanner un passager
//
router.post(
  "/bookings/:bookingId/scan-passenger",
  ridesController.scanPassengerBooking
);

//
// POST marquer un passager absent
//
router.post(
  "/bookings/:bookingId/mark-absent",
  ridesController.markPassengerAbsent
);

//
// POST démarrer un trajet
// bloqué tant que tous les passagers ne sont pas traités
//
router.post("/:id/start", ridesController.startRide);

router.patch("/:id/location", ridesController.updateRideLocation) //suivi
//
// POST terminer un trajet + capturer les paiements
//
router.post("/:id/complete", async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (
      ride.status !== "published" &&
      ride.status !== "open" &&
      ride.status !== "started"
    ) {
      return res.json({
        result: false,
        error: "Trajet non terminable",
      });
    }

    const bookings = await Booking.find({
      ride: ride._id,
      status: "authorized",
    });

    if (bookings.length === 0) {
      ride.status = "completed";
      await ride.save();

      return res.json({
        result: true,
        message: "Trajet terminé sans paiement à capturer",
        finalPricePerSeat: 0,
      });
    }

    let totalPassengers = 0;
    for (const booking of bookings) {
      totalPassengers += booking.seatsBooked;
    }

    const finalPricePerSeat = Math.floor(
      ride.totalCost / (totalPassengers + 1)
    );

    for (const booking of bookings) {
      const finalAmount = finalPricePerSeat * booking.seatsBooked;

      await stripe.paymentIntents.capture(booking.paymentIntentId, {
        amount_to_capture: finalAmount,
      });

      booking.status = "captured";
      booking.finalAmount = finalAmount;
      await booking.save();
    }

    ride.status = "completed";
    await ride.save();

    return res.json({
      result: true,
      message: "Trajet terminé et paiements capturés",
      finalPricePerSeat,
    });
  } catch (error) {
    console.error("POST /rides/:id/complete error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
});

module.exports = router;

/*const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const ridesController = require("../controllers/rides");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// POST créer un trajet
//
router.post("/create", async (req, res) => {
  try {
    const {
      token,
      departureAddress,
      destinationAddress,
      departureLatitude,
      departureLongitude,
      destinationLatitude,
      destinationLongitude,
      departureDateTime,
      pickupWalkMinutes,
      dropoffWalkMinutes,
      price,
      availableSeats,
    } = req.body;

    if (
      !token ||
      !departureAddress ||
      !destinationAddress ||
      departureLatitude === undefined ||
      departureLongitude === undefined ||
      destinationLatitude === undefined ||
      destinationLongitude === undefined ||
      !departureDateTime
    ) {
      return res.json({
        result: false,
        error: "Champs manquants pour créer le trajet.",
      });
    }

    const user = await User.findOne({ token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable.",
      });
    }

    const parsedSeats = Number(availableSeats) || 1;
    const parsedPrice = Number(price) || 0;

    if (parsedSeats <= 0) {
      return res.json({
        result: false,
        error: "Le nombre de places doit être supérieur à 0.",
      });
    }

    if (parsedPrice < 0) {
      return res.json({
        result: false,
        error: "Le prix est invalide.",
      });
    }

    const newRide = new Ride({
      user: user._id,

      departureAddress: departureAddress.trim(),
      destinationAddress: destinationAddress.trim(),

      departureLatitude: Number(departureLatitude),
      departureLongitude: Number(departureLongitude),
      destinationLatitude: Number(destinationLatitude),
      destinationLongitude: Number(destinationLongitude),

      departureDateTime: new Date(departureDateTime),

      pickupWalkMinutes: Number(pickupWalkMinutes) || 0,
      dropoffWalkMinutes: Number(dropoffWalkMinutes) || 0,

      // prix affiché côté front, en euros
      price: parsedPrice,

      // champs utiles pour les réservations / paiements
      placesTotal: parsedSeats,
      placesLeft: parsedSeats,
      totalCost: Math.round(parsedPrice * 100), // centimes
      status: "open",
    });

    const savedRide = await newRide.save();

    const populatedRide = await Ride.findById(savedRide._id).populate(
      "user",
      "firstname lastname prenom nom username email profilePhoto car"
    );

    return res.json({
      result: true,
      message: "Trajet créé avec succès.",
      ride: populatedRide,
    });
  } catch (error) {
    console.error("POST /rides/create error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
});

//
// GET trajets disponibles
//
router.get("/available", async (req, res) => {
  try {
    const now = new Date();

    const rides = await Ride.find({
      departureDateTime: { $gte: now },
      placesLeft: { $gt: 0 },
      status: "open",
    })
      .populate("user", "firstname lastname prenom nom username profilePhoto car")
      .sort({ departureDateTime: 1 });

    return res.json({
      result: true,
      rides,
    });
  } catch (error) {
    console.error("GET /rides/available error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// GET recherche de trajets
//
router.get("/search", async (req, res) => {
  try {
    const departure = req.query.departure?.trim() || "";
    const destination = req.query.destination?.trim() || "";
    const dateTime = req.query.dateTime?.trim() || "";
    const pickupWalkMinutes = Number(req.query.pickupWalkMinutes) || 0;
    const dropoffWalkMinutes = Number(req.query.dropoffWalkMinutes) || 0;

    if (!departure || !destination) {
      return res.json({
        result: false,
        error: "Les champs départ et destination sont obligatoires.",
      });
    }

    const filters = {
      $and: [
        {
          departureAddress: { $regex: departure, $options: "i" },
        },
        {
          destinationAddress: { $regex: destination, $options: "i" },
        },
        {
          placesLeft: { $gt: 0 },
        },
        {
          status: "open",
        },
      ],
    };

    if (dateTime) {
      const requestedDate = new Date(dateTime);

      if (!Number.isNaN(requestedDate.getTime())) {
        const startWindow = new Date(requestedDate.getTime() - 15 * 60 * 1000);
        const endWindow = new Date(requestedDate.getTime() + 15 * 60 * 1000);

        filters.$and.push({
          departureDateTime: {
            $gte: startWindow,
            $lte: endWindow,
          },
        });
      }
    } else {
      filters.$and.push({
        departureDateTime: { $gte: new Date() },
      });
    }

    const rides = await Ride.find(filters)
      .populate("user", "firstname lastname prenom nom username profilePhoto car")
      .sort({ departureDateTime: 1 });

    return res.json({
      result: true,
      rides,
      searchMeta: {
        departure,
        destination,
        dateTime,
        pickupWalkMinutes,
        dropoffWalkMinutes,
      },
    });
  } catch (error) {
    console.error("GET /rides/search error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// GET mes trajets en tant que conducteur
//
router.get("/driver/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable.",
      });
    }

    const rides = await Ride.find({ user: user._id })
      .sort({ departureDateTime: -1 });

    return res.json({
      result: true,
      rides,
    });
  } catch (error) {
    console.error("GET /rides/driver/:token error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// GET réservations passager
//
router.get("/passenger-bookings/:token", async (req, res) => {
  try {
    const token = req.params.token;

    if (!token) {
      return res.json({
        result: false,
        error: "Token manquant.",
      });
    }

    const user = await User.findOne({ token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable.",
      });
    }

    const bookings = await Booking.find({
      user: user._id,
    })
      .populate({
        path: "ride",
        populate: {
          path: "user",
          select: "firstname lastname prenom nom username profilePhoto car",
        },
      })
      .sort({ createdAt: -1 });

    return res.json({
      result: true,
      bookings,
    });
  } catch (error) {
    console.error("GET /rides/passenger-bookings/:token error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

//
// POST démarrer un trajet
//
router.post("/:id/start", async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (ride.status !== "open") {
      return res.json({
        result: false,
        error: "Le trajet ne peut pas être démarré",
      });
    }

    ride.status = "started";
    await ride.save();

    return res.json({
      result: true,
      message: "Trajet démarré",
      ride,
    });
  } catch (error) {
    console.error("POST /rides/:id/start error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
});

//
// POST terminer un trajet + capturer les paiements
//
router.post("/:id/complete", async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (ride.status !== "open" && ride.status !== "started") {
      return res.json({
        result: false,
        error: "Trajet non terminable",
      });
    }

    const bookings = await Booking.find({
      ride: ride._id,
      status: "authorized",
    });

    if (bookings.length === 0) {
      ride.status = "completed";
      await ride.save();

      return res.json({
        result: true,
        message: "Trajet terminé sans paiement à capturer",
        finalPricePerSeat: 0,
      });
    }

    let totalPassengers = 0;
    for (const booking of bookings) {
      totalPassengers += booking.seatsBooked;
    }

    const finalPricePerSeat = Math.floor(
      ride.totalCost / (totalPassengers + 1)
    );

    for (const booking of bookings) {
      const finalAmount = finalPricePerSeat * booking.seatsBooked;

      await stripe.paymentIntents.capture(booking.paymentIntentId, {
        amount_to_capture: finalAmount,
      });

      booking.status = "captured";
      booking.finalAmount = finalAmount;
      await booking.save();
    }

    ride.status = "completed";
    await ride.save();

    return res.json({
      result: true,
      message: "Trajet terminé et paiements capturés",
      finalPricePerSeat,
    });
  } catch (error) {
    console.error("POST /rides/:id/complete error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
});

module.exports = router; */