const express = require("express");
const router = express.Router();

const ratesController = require("../controllers/rates");

router.get("/", ratesController.healthcheck);

//
// PASSAGER -> note le conducteur
//
router.post("/rate-driver", ratesController.rateDriver);

//
// CONDUCTEUR -> note tous les passagers du trajet
//
router.post("/rate-passengers", ratesController.ratePassengers);

//
// AVIS REÇUS EN TANT QUE PASSAGER
//
router.get("/passenger/:token", ratesController.getPassengerRates);

//
// AVIS REÇUS EN TANT QUE CONDUCTEUR
//
router.get("/driver/:token", ratesController.getDriverRates);

//
// PROFIL PUBLIC D'UN CONDUCTEUR
//
router.get(
  "/driver-public-profile/:driverId",
  ratesController.getDriverPublicProfile
);

module.exports = router;