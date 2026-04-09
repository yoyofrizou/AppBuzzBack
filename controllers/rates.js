const mongoose = require("mongoose");
const Rate = require("../models/rates");
const User = require("../models/users");
const Ride = require("../models/rides");

function buildDistribution(rates = []) {   //Construit la répartition des notes pour l'ecran d'eval ou du profil public
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rates.filter((item) => Number(item.rating) === star).length,
  }));
}

function computeAverage(rates = []) {  //Calcule la moyenne des notes que j'utiliserai a plusieurs endroits
  if (!rates.length) return 0;

  const sum = rates.reduce((acc, item) => acc + (Number(item.rating) || 0), 0);
  return sum / rates.length;
}

exports.healthcheck = async (req, res) => {   //test
  return res.json({
    result: true,
    message: "rates route is working",
  });
};


// PASSAGER -> note le conducteur
exports.rateDriver = async (req, res) => {   //pour qu'un passager note un conducteur
  try {
    const { driverId, rideId, rating, comment, token } = req.body;   //recup les champs

    if (!driverId || !rideId || !rating || !token) {   //empeche une note incomplete
      return res.json({
        result: false,
        error: "Données manquantes",
      });
    }

    const reviewer = await User.findOne({ token });  //cherche le passager connecte

    if (!reviewer) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const alreadyRated = await Rate.findOne({   //verif les doublons meme si l’index en base existe déjà
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

    await Rate.create({  //enregistres la note dans le bon contexte de rôle
      rating,
      comment: comment || "",
      ride: rideId,
      reviewer: reviewer._id,
      reviewedUser: driverId,
      reviewerRole: "passenger",
      reviewedRole: "driver",
    });

    const driverRates = await Rate.find({  //recalcule le nombre d'avis et la moyenne conducteur
      reviewedUser: driverId,
      reviewedRole: "driver",
    });
//stocker le résumé directement dans User pour l’afficher rapidement ailleurs
    const driverRatingsCount = driverRates.length;
    const driverAverageRating =
      driverRatingsCount > 0
        ? driverRates.reduce((acc, item) => acc + item.rating, 0) /
          driverRatingsCount
        : 0;

    await User.updateOne(   //mets à jour la fiche du conducteur
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


// CONDUCTEUR -> note tous les passagers du trajet

exports.ratePassengers = async (req, res) => {
  try {
    const { rideId, token, ratings } = req.body;

    if (!rideId || !token || !Array.isArray(ratings) || ratings.length === 0) {   //vérifie qu’il y a bien au moins une évaluation
      return res.json({
        result: false,
        error: "Données manquantes",
      });
    }

    const reviewer = await User.findOne({ token });  //c'est le conducteur

    if (!reviewer) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const ride = await Ride.findById(rideId);  //retrouver le ride et veirfier qu il appartient au conducteur

    if (!ride) {
      return res.json({
        result: false,
        error: "Trajet introuvable",
      });
    }

    if (String(ride.user) !== String(reviewer._id)) {    //empêche quelqu’un d’autre de noter les passagers de ce trajet
      return res.json({
        result: false,
        error: "Vous ne pouvez pas noter les passagers de ce trajet",
      });
    }

    const createdRates = [];
    const skippedRates = [];

    for (const item of ratings) {     //peut noter plusieurs passagers
      if (!item.passengerId || !item.rating) {
        continue;
      }

      const alreadyRated = await Rate.findOne({   //anti doublon
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

      const savedRate = await Rate.create({   //cree l'avis
        rating: item.rating,
        comment: item.comment || "",
        ride: rideId,
        reviewer: reviewer._id,
        reviewedUser: item.passengerId,
        reviewerRole: "driver",
        reviewedRole: "passenger",
      });

      createdRates.push(savedRate);

      const passengerRates = await Rate.find({  //recalcul nombre d'avis et moyenne passager
        reviewedUser: item.passengerId,
        reviewedRole: "passenger",
      });

      const passengerRatingsCount = passengerRates.length;
      const passengerAverageRating =
        passengerRatingsCount > 0
          ? passengerRates.reduce((acc, rate) => acc + rate.rating, 0) /
            passengerRatingsCount
          : 0;

      await User.updateOne(    //garde un résumé directement dans l’utilisateur
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


// AVIS REÇUS EN TANT QUE PASSAGER

exports.getPassengerRates = async (req, res) => {   //Récupérer les avis reçus par un utilisateur en tant que passager
  try {
    const user = await User.findOne({ token: req.params.token });   //retrouver le user

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const rates = await Rate.find({    //chercher les rate ou reviewedUser = user._id et reviewedRole = "passenger"
      reviewedUser: user._id,
      reviewedRole: "passenger",
    })
      .populate("reviewer", "prenom nom profilePhoto")   //peupler le reviewer
      .sort({ createdAt: -1 });   //trier du plus recent au plus ancien

    const total = rates.length;   //calculer total, moyenne et distribution
    const average = computeAverage(rates);
    const distribution = buildDistribution(rates);

    return res.json({    //tout renvoyer
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


// AVIS REÇUS EN TANT QUE CONDUCTEUR

exports.getDriverRates = async (req, res) => {  //meme logique mais pour les avis recus comme conducteur
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


// PROFIL PUBLIC D'UN CONDUCTEUR

exports.getDriverPublicProfile = async (req, res) => {   //afficher le profil conducteur avec reputation + activite a venir
  try {
    const { driverId } = req.params;

    if (!driverId) {
      return res.json({
        result: false,
        error: "driverId manquant.",
      });
    }

       if (!mongoose.Types.ObjectId.isValid(driverId)) {   //securise la requete avant de lancer un findById
  return res.status(400).json({
    result: false,
    error: "driverId invalide.",
  });
}

    const driver = await User.findById(driverId).select(   //renvoi que les champs utiles
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

exports.getPassengerPublicProfile = async (req, res) => {  //meme logique pour passager
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