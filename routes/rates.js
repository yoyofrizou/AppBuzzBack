const express = require("express");
const router = express.Router();
//crée le router et tu délègues toute la logique au controller. ar il y a une vraie logique metier 
const ratesController = require("../controllers/rates");
const connectDB = require("../config/connectDB");

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

router.get("/", ratesController.healthcheck);   //test


// PASSAGER -> note le conducteur
router.post("/rate-driver", ratesController.rateDriver);


// CONDUCTEUR -> note tous les passagers du trajet
router.post("/rate-passengers", ratesController.ratePassengers);


// AVIS REÇUS EN TANT QUE PASSAGER
router.get("/passenger/:token", ratesController.getPassengerRates);


// AVIS REÇUS EN TANT QUE CONDUCTEUR
router.get("/driver/:token", ratesController.getDriverRates);


// PROFIL PUBLIC D'UN CONDUCTEUR
router.get(
  "/driver-public-profile/:driverId",
  ratesController.getDriverPublicProfile
);

// PROFIL PUBLIC D'UN PASSAGER
router.get(
  "/passenger-public-profile/:passengerId",
  ratesController.getPassengerPublicProfile
);

module.exports = router;