const express = require('express');
const router = express.Router();
const Ride = require("../models/rides");
const User = require("../models/users");

router.post("/add", async (req, res) => {
  if (!req.body.departure || !req.body.arrival || !req.body.date || !req.body.price || !req.body.placeAvailable || !req.body.user || !req.body.driver ) {
    return res.json({
      result: false,
      error: "Remplir tous les champs.",
    });
  }

  const newRide = new Ride({
    departure: req.body.departure,
    arrival: req.body.arrival,
    date: req.body.date,
    price: req.body.price,
    placeAvailable: req.body.placeAvailable,
    user: req.body.user,
    driver: req.body.driver,
  });
  
  const ride = await newRide.save()
    res.json({ result: true, ride: ride });
});

router.get("/:token", async (req, res) => {
  const user = await User.findOne({ token: req.params.token });
    if (!user) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }
    const ride = await Ride.find({ user: user._id })
      .populate("ride","user")
      res.json({ result: true, rides: ride });
});


router.delete("/delete/:rideId", async (req, res) => {
  const ride = await Ride.deleteOne({ _id: req.params.rideId })
    if (ride.deletedCount > 0) {
      res.json({ result: true, message: "Trajet supprimé" });
    } else {
      res.json({ result: false, error: "Trajet non trouvé" });
    }
});

module.exports = router;