const express = require("express");
const router = express.Router();

const Rate = require("../models/rates");
const User = require("../models/users");


// PASSAGER -> note le conducteur
router.post("/rate-driver", async (req, res) => {
  try {
    const { driverId, rideId, rating, comment, token } = req.body;

    if (!driverId || !rideId || !rating || !token) {
      return res.json({ result: false, error: "Données manquantes" });
    }

    const reviewer = await User.findOne({ token });
    if (!reviewer) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    const alreadyRated = await Rate.findOne({
      ride: rideId,
      reviewer: reviewer._id,
      reviewedUser: driverId,
      reviewerRole: "passenger",
      reviewedRole: "driver",
    });

    if (alreadyRated) {
      return res.json({ result: false, error: "ALREADY_RATED" });
    }

    const newRate = new Rate({
      rating,
      comment: comment || "",
      ride: rideId,
      reviewer: reviewer._id,
      reviewedUser: driverId,
      reviewerRole: "passenger",
      reviewedRole: "driver",
    });

const savedRate = await newRate.save();

    // recalcul moyenne conducteur
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
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;

// CONDUCTEUR -> note tous les passagers du trajet
router.post("/rate-passengers", async (req, res) => {
  try {
    const { rideId, token, ratings } = req.body;
    // ratings = [{ passengerId, rating, comment }]

    if (!rideId || !token || !Array.isArray(ratings) || ratings.length === 0) {
      return res.json({ result: false, error: "Données manquantes" });
    }

    const reviewer = await User.findOne({ token });
    if (!reviewer) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
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

      const newRate = new Rate({
        rating: item.rating,
        comment: item.comment || "",
        ride: rideId,
        reviewer: reviewer._id,
        reviewedUser: item.passengerId,
        reviewerRole: "driver",
        reviewedRole: "passenger",
      });

      const savedRate = await newRate.save();
      createdRates.push(savedRate);

      // ✅ recalcul moyenne passager
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
    return res.json({ result: false, error: error.message });
  }
});

// AVIS REÇUS EN TANT QUE PASSAGER
router.get("/passenger/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    const rates = await Rate.find({
      reviewedUser: user._id,
      reviewedRole: "passenger",
    })
      .populate("reviewer", "prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const sum = rates.reduce((acc, item) => acc + item.rating, 0);
    const average = total > 0 ? sum / total : 0;

    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: rates.filter((item) => item.rating === star).length,
    }));

    return res.json({
      result: true,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
    });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

// AVIS REÇUS EN TANT QUE CONDUCTEUR
router.get("/driver/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    const rates = await Rate.find({
      reviewedUser: user._id,
      reviewedRole: "driver",
    })
      .populate("reviewer", "prenom nom profilePhoto")
      .sort({ createdAt: -1 });

    const total = rates.length;
    const sum = rates.reduce((acc, item) => acc + item.rating, 0);
    const average = total > 0 ? sum / total : 0;

    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: rates.filter((item) => item.rating === star).length,
    }));

    return res.json({
      result: true,
      average: Number(average.toFixed(1)),
      total,
      distribution,
      rates,
    });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;