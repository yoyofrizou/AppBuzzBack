var express = require('express');
var router = express.Router();
const Ride = require("../models/rides");

router.post("/", (req, res) => {
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
  
  newRide.save().then((data) => {
    res.json({ result: true, ride: data });
  });
});


module.exports = router;