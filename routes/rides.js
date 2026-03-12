var express = require("express");
var router = express.Router();

const Ride = require("../models/rides");

router.get("/available", async (req, res) => {
  try {
    const rides = await Ride.find();

    res.json({
      result: true,
      rides,
    });
  } catch (error) {
    console.error(error);
    res.json({
      result: false,
      error: "Erreur serveur",
    });
  }
});

module.exports = router;