const express = require("express");
const router = express.Router();
const Stripe = require("stripe"); //import Stripe car certaines actions sur les trajets ont un impact sur les paiements : demarrage, annulation, capture

const Ride = require("../models/rides");
const Booking = require("../models/bookings");
const ridesController = require("../controllers/rides"); //J’ai gardé la route comme point d’entrée, mais déplacé les traitements métier les plus importants dans un controller pour mieux séparer les responsabilités
const connectDB = require("../config/connectDB");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
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

function toRadians(value) {   
  return (value * Math.PI) / 180;   //Conversion degrés → radians
}

function getDistanceMeters(lat1, lon1, lat2, lon2) { //calcules la distance en mètres entre deux points GPS
  const earthRadius = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function minutesToMeters(minutes) {   //convertis la marche acceptable en rayon de recherche
  return minutes * 150; //traduis un besoin utilisateur (“je peux marcher 5 minutes”) en donnée exploitable par l’algorithme
}


router.get("/", async (req, res) => {  //renvoie tous les trajets
  try {
    const rides = await Ride.find();
    return res.json({ result: true, rides });
  } catch (error) {
    return res.status(500).json({
      result: false,
      error: error.message,
    });
  }
});

//
// POST créer un trajet
//
router.post("/create", ridesController.createRide);

//
// GET trajets disponibles
//
router.get("/available", async (req, res) => {  //récupérer les trajets très proches et très proches dans le temps
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.json({
        result: true,
        rides: [],
      });
    }

    const now = new Date();
    const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000);

    const rides = await Ride.find({  //filtre trajet imminent avec encore de la place et ouvert
      departureDateTime: {
        $gte: now,
        $lte: in15Minutes,
      },
      placesLeft: { $gt: 0 },
      status: { $in: ["published", "open"] },
    })
      .populate(  //j'enrichis le trajet avec les infos conducteur 
        "user",
        "firstname lastname prenom nom username profilePhoto car driverAverageRating driverRatingsCount"
      )
      .sort({ departureDateTime: 1 });

    const nearbyRides = rides.filter((ride) => {   
      const rideLat = Number(ride.departureLatitude);
      const rideLng = Number(ride.departureLongitude);

      if (Number.isNaN(rideLat) || Number.isNaN(rideLng)) {
        return false;
      }

      const distanceMeters = getDistanceMeters(lat, lng, rideLat, rideLng);

      // ex: 1 km autour du passager
      return distanceMeters <= 1000;  //1km max autour
    });

    return res.json({
      result: true,
      rides: nearbyRides,
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
router.get("/search", async (req, res) => {   //une des routes les plus importantes
  try {
    const departure = req.query.departure?.trim() || "";    //recup les adresses
    const destination = req.query.destination?.trim() || "";
    const dateTime = req.query.dateTime?.trim() || "";  //recup la date

    const departureLat = Number(req.query.departureLat); //recup les coordonnées réelles
    const departureLng = Number(req.query.departureLng);
    const destinationLat = Number(req.query.destinationLat);
    const destinationLng = Number(req.query.destinationLng);

    const pickupWalkMinutes = Number(req.query.pickupWalkMinutes) || 5;    //valeurs par défaut si le front ne les envoie pas
    const dropoffWalkMinutes = Number(req.query.dropoffWalkMinutes) || 10;

    if (!departure || !destination) {    //Validation minimale
      return res.json({
        result: false,
        error: "Les champs départ et destination sont obligatoires.",
      });
    }

    if (
      Number.isNaN(departureLat) ||    //force l’usage des coordonnées GPS, la recherche finale doit être géographique, pas seulement textuelle
      Number.isNaN(departureLng) ||
      Number.isNaN(destinationLat) ||
      Number.isNaN(destinationLng)
    ) {
      return res.json({
        result: false,
        error:
          "Les coordonnées de départ et d’arrivée sont obligatoires pour la recherche.",
      });
    }

    // Le passager décide de sa marche acceptable.
    // On convertit juste ses minutes en mètres.
    const pickupRadiusMeters = minutesToMeters(pickupWalkMinutes);
    const dropoffRadiusMeters = minutesToMeters(dropoffWalkMinutes);

    const filters = {    //limite aux trajets réellement réservables
      placesLeft: { $gt: 0 },
      status: { $in: ["published", "open"] },
    };

    if (dateTime) {
      const requestedDate = new Date(dateTime);

      if (!Number.isNaN(requestedDate.getTime())) {   //fenêtre de tolérance de ±15 minutes
        const startWindow = new Date(requestedDate.getTime() - 15 * 60 * 1000);
        const endWindow = new Date(requestedDate.getTime() + 15 * 60 * 1000);

        filters.departureDateTime = {
          $gte: startWindow,
          $lte: endWindow,
        };
      }
    } else {
      filters.departureDateTime = { $gte: new Date() };
    }

    const rides = await Ride.find(filters)
      .populate(
        "user",
        "firstname lastname prenom nom username profilePhoto car driverAverageRating driverRatingsCount"
      )
      .sort({ departureDateTime: 1 });

    const matchedRides = rides   //parcours les trajets pour calculer les distances exactes
      .map((ride) => {
        const rideDepartureLat = Number(ride.departureLatitude);
        const rideDepartureLng = Number(ride.departureLongitude);
        const rideDestinationLat = Number(ride.destinationLatitude);
        const rideDestinationLng = Number(ride.destinationLongitude);

        if (
          Number.isNaN(rideDepartureLat) ||
          Number.isNaN(rideDepartureLng) ||
          Number.isNaN(rideDestinationLat) ||
          Number.isNaN(rideDestinationLng)
        ) {
          return null;
        }

        const departureDistanceMeters = getDistanceMeters(     //calcul séparé de la distance de depart et d'arrivee
          departureLat,
          departureLng,
          rideDepartureLat,
          rideDepartureLng
        );

        const destinationDistanceMeters = getDistanceMeters(
          destinationLat,
          destinationLng,
          rideDestinationLat,
          rideDestinationLng
        );

        const matchesDeparture =    //vérifies si le trajet est acceptable côté départ et côté arrivée
          departureDistanceMeters <= pickupRadiusMeters;
        const matchesDestination =
          destinationDistanceMeters <= dropoffRadiusMeters;

       
        const closeEnoughOverall = //tolerance pour eviter qu’un trajet très proche soit rejeté pour quelques mètres
          departureDistanceMeters + destinationDistanceMeters <=
          pickupRadiusMeters + dropoffRadiusMeters + 500;


        if ((!matchesDeparture || !matchesDestination) && !closeEnoughOverall) {
          return null;
        }

        return {
          ...ride.toObject(),
          departureDistanceMeters: Math.round(departureDistanceMeters),
          destinationDistanceMeters: Math.round(destinationDistanceMeters),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {    //tries les résultats du plus pertinent au moins pertinent
        const aScore = a.departureDistanceMeters + a.destinationDistanceMeters;
        const bScore = b.departureDistanceMeters + b.destinationDistanceMeters;
        return aScore - bScore;
      });

    return res.json({
      result: true,
      rides: matchedRides,
      searchMeta: {
        departure,
        destination,
        dateTime,
        pickupWalkMinutes,
        dropoffWalkMinutes,
        pickupRadiusMeters,
        dropoffRadiusMeters,
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


//2 routes ou je délègue au controller les trajets conducteur et les réservations passager
// GET mes trajets en tant que conducteur
router.get("/driver/:token", ridesController.getDriverTrips);


// GET réservations passager
router.get("/passenger-bookings/:token", ridesController.getPassengerBookings);


//3 Routes liées à la présence du passager
// POST scanner un passager
router.post(
  "/bookings/:bookingId/scan-passenger",
  ridesController.scanPassengerBooking
);

// POST validation manuelle
router.post(
  "/bookings/:bookingId/manual-validate",
  ridesController.validatePassengerManually
);

// POST marquer un passager absent
router.post(
  "/bookings/:bookingId/mark-absent",
  ridesController.markPassengerAbsent
);

router.patch("/:id/cancel", ridesController.cancelRide);

// POST démarrer un trajet
// bloqué tant que tous les passagers ne sont pas traités
router.post("/:id/start", ridesController.startRide);

// PATCH mise à jour localisation conducteur pendant le trajet
router.patch("/:id/location", ridesController.updateRideLocation);

// POST terminer un trajet
router.post("/:id/complete", async (req, res) => { 
  try {
    const ride = await Ride.findById(req.params.id);   //verif que le trajet existe

    if (!ride) {   
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (ride.status === "completed") {  //verif qu il est pas deja termine
      return res.json({
        result: true,
        message: "Trajet déjà terminé",
        ride,
      });
    }

    if (ride.status !== "started") {  //verif qu il a bien demarrer 
      return res.json({
        result: false,
        error: "Seul un trajet démarré peut être terminé",
      });
    }

    ride.status = "completed";
    await ride.save();     //puis je le passe a completed

    return res.json({
      result: true,
      message: "Trajet terminé",
      ride,
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