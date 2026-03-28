const mongoose = require("mongoose");
const Rate = require("../models/rates");
const User = require("../models/users");
const Ride = require("../models/rides");

function buildDistribution(rates = []) {
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rates.filter((item) => Number(item.rating) === star).length,
  }));
}

function computeAverage(rates = []) {
  if (!rates.length) return 0;

  const sum = rates.reduce((acc, item) => acc + (Number(item.rating) || 0), 0);
  return sum / rates.length;
}

exports.healthcheck = async (req, res) => {
  return res.json({
    result: true,
    message: "rates route is working",
  });
};

//
// PASSAGER -> note le conducteur
//
exports.rateDriver = async (req, res) => {
  try {
    const { driverId, rideId, rating, comment, token } = req.body;

    if (!driverId || !rideId || !rating || !token) {
      return res.json({
        result: false,
        error: "Données manquantes",
      });
    }

    const reviewer = await User.findOne({ token });

    if (!reviewer) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const alreadyRated = await Rate.findOne({
      ride: rideId,
      reviewer: reviewer._id,
      reviewedUser: driverId,
      reviewerRole: "passenger",
      reviewedRole: "driver",
    });

    if (alreadyRated) {
      return res.json({
        result: false,
        error: "ALREADY_RATED",
      });
    }

    await Rate.create({
      rating,
      comment: comment || "",
      ride: rideId,
      reviewer: reviewer._id,
      reviewedUser: driverId,
      reviewerRole: "passenger",
      reviewedRole: "driver",
    });

    const driverRates = await Rate.find({
      reviewedUser: driverId,
      reviewedRole: "driver",
    });

    const driverRatingsCount = driverRates.length;
    const driverAverageRating =
      driverRatingsCount > 0
        ? driverRates.reduce((acc, item) => acc + item.rating, 0) /
          driverRatingsCount
        : 0;

    await User.updateOne(
      { _id: driverId },
      {
        driverAverageRating: Number(driverAverageRating.toFixed(1)),
        driverRatingsCount,
      }
    );

    return res.json({
      result: true,
      driverAverageRating: Number(driverAverageRating.toFixed(1)),
      driverRatingsCount,
    });
  } catch (error) {
    console.error("rateDriver error:", error);
    return res.json({
      result: false,
      error: error.message,
    });
  }
};

//
// CONDUCTEUR -> note tous les passagers du trajet
//
exports.ratePassengers = async (req, res) => {
  try {
    const { rideId, token, ratings } = req.body;
    // ratings = [{ passengerId, rating, comment }]

    if (!rideId || !token || !Array.isArray(ratings) || ratings.length === 0) {
      return res.json({
        result: false,
        error: "Données manquantes",
      });
    }

    const reviewer = await User.findOne({ token });

    if (!reviewer) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (String(ride.user) !== String(reviewer._id)) {
      return res.json({
        result: false,
        error: "Vous ne pouvez pas noter les passagers de ce trajet",
      });
    }

    const createdRates = [];
    const skippedRates = [];

    for (const item of ratings) {
      if (!item.passengerId || !item.rating) {
        continue;
      }

      const alreadyRated = await Rate.findOne({
        ride: rideId,
        reviewer: reviewer._id,
        reviewedUser: item.passengerId,
        reviewerRole: "driver",
        reviewedRole: "passenger",
      });

      if (alreadyRated) {
        skippedRates.push(item.passengerId);
        continue;
      }

      const savedRate = await Rate.create({
        rating: item.rating,
        comment: item.comment || "",
        ride: rideId,
        reviewer: reviewer._id,
        reviewedUser: item.passengerId,
        reviewerRole: "driver",
        reviewedRole: "passenger",
      });

      createdRates.push(savedRate);

      const passengerRates = await Rate.find({
        reviewedUser: item.passengerId,
        reviewedRole: "passenger",
      });

      const passengerRatingsCount = passengerRates.length;
      const passengerAverageRating =
        passengerRatingsCount > 0
          ? passengerRates.reduce((acc, rate) => acc + rate.rating, 0) /
            passengerRatingsCount
          : 0;

      await User.updateOne(
        { _id: item.passengerId },
        {
          passengerAverageRating: Number(passengerAverageRating.toFixed(1)),
          passengerRatingsCount,
        }
      );
    }

    return res.json({
      result: true,
      createdRates,
      skippedRates,
    });
  } catch (error) {
    console.error("ratePassengers error:", error);
    return res.json({
      result: false,
      error: error.message,
    });
  }
};

//
// AVIS REÇUS EN TANT QUE PASSAGER
//
exports.getPassengerRates = async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const rates = await Rate.find({
      reviewedUser: user._id,
      reviewedRole: "passenger",
    })
      .populate("reviewer", "prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const average = computeAverage(rates);
    const distribution = buildDistribution(rates);

    return res.json({
      result: true,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
    });
  } catch (error) {
    console.error("getPassengerRates error:", error);
    return res.json({
      result: false,
      error: error.message,
    });
  }
};

//
// AVIS REÇUS EN TANT QUE CONDUCTEUR
//
exports.getDriverRates = async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const rates = await Rate.find({
      reviewedUser: user._id,
      reviewedRole: "driver",
    })
      .populate("reviewer", "prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const average = computeAverage(rates);
    const distribution = buildDistribution(rates);

    return res.json({
      result: true,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
    });
  } catch (error) {
    console.error("getDriverRates error:", error);
    return res.json({
      result: false,
      error: error.message,
    });
  }
};

//
// PROFIL PUBLIC D'UN CONDUCTEUR
//
exports.getDriverPublicProfile = async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!driverId) {
      return res.json({
        result: false,
        error: "driverId manquant.",
      });
    }

       if (!mongoose.Types.ObjectId.isValid(driverId)) {
  return res.status(400).json({
    result: false,
    error: "driverId invalide.",
  });
}

    const driver = await User.findById(driverId).select(
      "firstname lastname prenom nom username profilePhoto car driverAverageRating driverRatingsCount"
    );

    if (!driver) {
      return res.json({
        result: false,
        error: "Conducteur introuvable.",
      });
    }

    const rates = await Rate.find({
      reviewedUser: driver._id,
      reviewedRole: "driver",
    })
      .populate("reviewer", "firstname lastname prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const average = computeAverage(rates);
    const distribution = buildDistribution(rates);

const upcomingRides = await Ride.find({
      user: driver._id,
      departureDateTime: { $gte: new Date() },
      placesLeft: { $gt: 0 },
      status: { $in: ["published", "open"] },
    })
      .sort({ departureDateTime: 1 })
      .select(
        "departureAddress destinationAddress departureDateTime price placesLeft departureLatitude departureLongitude destinationLatitude destinationLongitude"
      ); 

    return res.json({
      result: true,
      driver,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
      upcomingRides,
    });
  } catch (error) {
    console.error("getDriverPublicProfile error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
};

// PROFIL PUBLIC D'UN PASSAGER
//
exports.getPassengerPublicProfile = async (req, res) => {
  try {
    const { passengerId } = req.params;

    if (!passengerId) {
      return res.json({
        result: false,
        error: "passengerId manquant.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(passengerId)) {
      return res.status(400).json({
        result: false,
        error: "passengerId invalide.",
      });
    }

    const passenger = await User.findById(passengerId).select(
      "firstname lastname prenom nom username profilePhoto passengerAverageRating passengerRatingsCount"
    );

    if (!passenger) {
      return res.json({
        result: false,
        error: "Passager introuvable.",
      });
    }

    const rates = await Rate.find({
      reviewedUser: passenger._id,
      reviewedRole: "passenger",
    })
      .populate("reviewer", "firstname lastname prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const average = computeAverage(rates);
    const distribution = buildDistribution(rates);

    return res.json({
      result: true,
      passenger,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
    });
  } catch (error) {
    console.error("getPassengerPublicProfile error:", error);
    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
};