const express = require("express"); //librairie qui permet de creer des routes (API backend)
const router = express.Router(); //va contenir toutes les routes liées aux rides et sera branche dans app.js
const Ride = require("../models/rides"); // import du modele Ride pour pouvoir creer un trajet, lire un trajet ou supprimer un trajet
const User = require("../models/users"); //pour retrouver un utilisateur avec son token

router.post("/add", async (req, res) => {
  if (
    !req.body.departure ||
    !req.body.arrival ||
    !req.body.date ||
    !req.body.price ||
    !req.body.placeAvailable ||
    !req.body.user
  ) {
    return res.json({
      result: false,
      error: "Remplir tous les champs.", 
    });
  }

  // ajout margo : vérifier totalCost (centimes)
  const placesTotal = Number(req.body.placesTotal); //transforme la valeur envoyée en Number car souvent envoyee par le front en string
  const totalCost = Number(req.body.totalCost); //pareil

  if (!placesTotal || placesTotal <= 0) {
    //verifie que placesTotal est un nombre valide et positif
    //placesTotal <= 0 verifie si 0 ou negatif
    return res.json({ result: false, error: "placesTotal invalide" });
  }

  if (!totalCost || totalCost <= 0) {
    return res.json({ result: false, error: "totalCost invalide" });
  }

  const newRide = new Ride({
    departure: req.body.departure,
    arrival: req.body.arrival,
    date: req.body.date,
    price: req.body.price,

    // ajouts margaux nécessaires au paiement simulé
    placesTotal: placesTotal,
    placesLeft: placesTotal,
    totalCost: totalCost,
    status: "open",

    user: req.body.user,
  });

  const ride = await newRide.save(); //enregistre le ride en base
  res.json({ result: true, ride: ride }); //renvoie le ride créé au frontend
});

router.get("/:token", async (req, res) => {    
  const user = await User.findOne({ token: req.params.token }); 
    if (!user) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }
    const ride = await Ride.find({ user: user._id })   
      res.json({ result: true, rides: ride });
});

router.get("/", async (req, res) => {
 const rides = await Ride.find().populate("user", "username");
  res.json({ result: true, rides });
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
