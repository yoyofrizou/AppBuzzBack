const Ride = require("../models/rides");
const User = require("../models/users");
const Booking = require("../models/bookings");

//
// ======================
// HELPERS
// ======================
//

// catégorie côté conducteur
function getTripCategoryFromRide(ride) {
  if (!ride) return "upcoming";

  if (ride.status === "open") return "upcoming";
  if (ride.status === "published") return "upcoming";
  if (ride.status === "started") return "current";
  if (ride.status === "completed") return "past";
  if (ride.status === "cancelled") return "cancelled";

  return "upcoming";
}

// catégorie côté passager
function getPassengerTripCategory(booking) {
  const ride = booking?.ride;

  if (!ride) return "upcoming";

  if (ride.status === "completed") return "past";

  if (booking.passengerPresenceStatus === "scanned") return "current";

  return "upcoming";
}

// logique démarrage conducteur
function canDriverStartRide(passengers = []) {
  if (!passengers.length) return false;

  return passengers.every((booking) =>
    ["scanned", "absent"].includes(booking.passengerPresenceStatus)
  );
}

// normalisation conducteur
function normalizeDriverUser(userDoc) {
  if (!userDoc) return null;

  return {
    _id: userDoc._id,
    firstname: userDoc.firstname || "",
    lastname: userDoc.lastname || "",
    prenom: userDoc.prenom || userDoc.firstname || "",
    nom: userDoc.nom || userDoc.lastname || "",
    username: userDoc.username || "",
    email: userDoc.email || "",
    profilePhoto: userDoc.profilePhoto || null,
    car: userDoc.car || null,
  };
}

// normalisation passager
function normalizePassengerUser(userDoc) {
  if (!userDoc) return null;

  return {
    _id: userDoc._id,
    firstname: userDoc.firstname || "",
    lastname: userDoc.lastname || "",
    prenom: userDoc.prenom || userDoc.firstname || "",
    nom: userDoc.nom || userDoc.lastname || "",
    username: userDoc.username || "",
    email: userDoc.email || "",
    profilePhoto: userDoc.profilePhoto || null,
  };
}

// enrich ride pour le front
function enrichRideForFrontend(rideDoc) {
  const ride = rideDoc?.toObject ? rideDoc.toObject() : rideDoc;

  return {
    ...ride,
    driver: normalizeDriverUser(ride.user),
    tripCategory: getTripCategoryFromRide(ride),
  };
}

//
// ======================
// CREATE RIDE
// ======================
//

exports.createRide = async (req, res) => {
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

      price: parsedPrice,
      placesTotal: parsedSeats,
      placesLeft: parsedSeats,
      totalCost: Math.round(parsedPrice * 100),
      status: "published",
    });

    const savedRide = await newRide.save();

    const populatedRide = await Ride.findById(savedRide._id).populate(
      "user",
      "firstname lastname prenom nom username email profilePhoto car"
    );

    return res.json({
      result: true,
      message: "Trajet créé avec succès.",
      ride: enrichRideForFrontend(populatedRide),
    });
  } catch (error) {
    console.error("createRide controller error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
};

//
// ======================
// DRIVER TRIPS
// ======================
//

exports.getDriverTrips = async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable.",
      });
    }

    const rides = await Ride.find({ user: user._id })
      .populate(
        "user",
        "firstname lastname prenom nom username email profilePhoto car"
      )
      .sort({ departureDateTime: -1 });

    const enrichedRides = [];

    for (const rideDoc of rides) {
      const bookingDocs = await Booking.find({
        ride: rideDoc._id,
        status: { $in: ["authorized", "captured"] },
      })
        .populate(
          "user",
          "firstname lastname prenom nom username email profilePhoto"
        )
        .sort({ createdAt: 1 });

      const passengers = bookingDocs.map((bookingDoc) => {
        const booking = bookingDoc.toObject();

        return {
          ...booking,
          passenger: normalizePassengerUser(booking.user),
        };
      });

      const ride = enrichRideForFrontend(rideDoc);

      enrichedRides.push({
        ...ride,
        passengers,
        canStartRide: canDriverStartRide(passengers),
      });
    }

    return res.json({
      result: true,
      rides: enrichedRides,
    });
  } catch (error) {
    console.error("getDriverTrips controller error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
};

//
// ======================
// PASSENGER BOOKINGS
// ======================
//

exports.getPassengerBookings = async (req, res) => {
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
      status: { $in: ["authorized", "captured"] },
    })
      .populate({
        path: "ride",
        populate: {
          path: "user",
          select: "firstname lastname prenom nom username profilePhoto car",
        },
      })
      .sort({ createdAt: -1 });

    const enrichedBookings = bookings
      .filter((booking) => booking.ride)
      .map((bookingDoc) => {
        const booking = bookingDoc.toObject();
        const enrichedRide = enrichRideForFrontend(booking.ride);

        return {
          ...booking,
          ride: enrichedRide,
          tripCategory: getPassengerTripCategory({
            ...booking,
            ride: enrichedRide,
          }),
        };
      });

    return res.json({
      result: true,
      bookings: enrichedBookings,
    });
  } catch (error) {
    console.error("getPassengerBookings controller error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
};

//
// ======================
// SCAN PASSENGER QR
// ======================
//

exports.scanPassengerBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).populate({
      path: "ride",
      populate: {
        path: "user",
        select: "firstname lastname prenom nom username email profilePhoto car",
      },
    });

    if (!booking) {
      return res.status(404).json({
        result: false,
        error: "Réservation introuvable.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        result: false,
        error: "Réservation annulée.",
      });
    }

    booking.passengerPresenceStatus = "scanned";
    booking.scannedAt = new Date();
    booking.absentMarkedAt = null;
    await booking.save();

    const enrichedRide = enrichRideForFrontend(booking.ride);

    return res.json({
      result: true,
      message: "QR code validé.",
      booking: {
        ...booking.toObject(),
        ride: enrichedRide,
        tripCategory: getPassengerTripCategory({
          ...booking.toObject(),
          ride: enrichedRide,
        }),
      },
    });
  } catch (error) {
    console.error("scanPassengerBooking controller error:", error);
    return res.status(500).json({
      result: false,
      error: "Impossible de valider le QR code.",
    });
  }
};

//
// ======================
// MARK PASSENGER ABSENT
// ======================
//

exports.markPassengerAbsent = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).populate({
      path: "ride",
      populate: {
        path: "user",
        select: "firstname lastname prenom nom username email profilePhoto car",
      },
    });

    if (!booking) {
      return res.status(404).json({
        result: false,
        error: "Réservation introuvable.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        result: false,
        error: "Réservation annulée.",
      });
    }

    booking.passengerPresenceStatus = "absent";
    booking.absentMarkedAt = new Date();
    booking.scannedAt = null;
    await booking.save();

    const enrichedRide = enrichRideForFrontend(booking.ride);

    return res.json({
      result: true,
      message: "Passager marqué absent.",
      booking: {
        ...booking.toObject(),
        ride: enrichedRide,
        tripCategory: getPassengerTripCategory({
          ...booking.toObject(),
          ride: enrichedRide,
        }),
      },
    });
  } catch (error) {
    console.error("markPassengerAbsent controller error:", error);
    return res.status(500).json({
      result: false,
      error: "Impossible de marquer le passager absent.",
    });
  }
};

//
// ======================
// START RIDE
// ======================
//

exports.startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (ride.status !== "published" && ride.status !== "open") {
      return res.json({
        result: false,
        error: "Le trajet ne peut pas être démarré",
      });
    }

    const passengersBookings = await Booking.find({
      ride: ride._id,
      status: { $in: ["authorized", "captured"] },
    });

    const allPassengersHandled =
      passengersBookings.length > 0 &&
      passengersBookings.every((booking) =>
        ["scanned", "absent"].includes(booking.passengerPresenceStatus)
      );

    if (!allPassengersHandled) {
      return res.json({
        result: false,
        error:
          "Tous les passagers doivent être scannés ou marqués absents avant le démarrage.",
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
    console.error("startRide controller error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
};

// UPDATE RIDE LOCATION
// ======================
//

exports.updateRideLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { token, latitude, longitude } = req.body;

    if (!token || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        result: false,
        error: "Token, latitude et longitude sont requis.",
      });
    }

    const user = await User.findOne({ token });

    if (!user) {
      return res.status(404).json({
        result: false,
        error: "Utilisateur introuvable.",
      });
    }

    const ride = await Ride.findOne({
      _id: id,
      user: user._id,
    }).populate(
      "user",
      "firstname lastname prenom nom username email profilePhoto car"
    );

    if (!ride) {
      return res.status(404).json({
        result: false,
        error: "Trajet introuvable.",
      });
    }

    if (ride.status !== "started") {
      return res.status(400).json({
        result: false,
        error: "La position ne peut être mise à jour que pour un trajet démarré.",
      });
    }

    ride.currentLatitude = Number(latitude);
    ride.currentLongitude = Number(longitude);
    ride.locationUpdatedAt = new Date();

    await ride.save();

    return res.json({
      result: true,
      message: "Position mise à jour.",
      ride: enrichRideForFrontend(ride),
    });
  } catch (error) {
    console.error("updateRideLocation controller error:", error);
    return res.status(500).json({
      result: false,
      error: "Impossible de mettre à jour la position.",
    });
  }
};