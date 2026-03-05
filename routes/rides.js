const express = require("express"); //librairie qui permet de creer des routes (API backend)
const router = express.Router(); //va contenir toutes les routes liées aux rides et sera branche dans app.js
const Ride = require("../models/rides"); // import du modele Ride pour pouvoir creer un trajet, lire un trajet ou supprimer un trajet
const User = require("../models/users"); //pour retrouver un utilisateur avec son token
const Booking = require("../models/bookings");

router.post("/add", async (req, res) => {
  if (
<<<<<<< HEAD
  !req.body.departure ||
  !req.body.arrival ||
  !req.body.date ||
  !req.body.price ||
  !req.body.placesTotal ||
  !req.body.user ||
  !req.body.driver
) {    //verifie que tous les champs sont présents, si le champ est vide, undefined ou null alors ca bloque
=======
    !req.body.departure ||
    !req.body.arrival ||
    !req.body.date ||
    !req.body.price ||
    !req.body.placeAvailable ||
    !req.body.user
  ) {
>>>>>>> 46d2818e16630cbeb07b9ba11163c1eead6baebe
    return res.json({
      result: false,
      error: "Remplir tous les champs.", 
    });
  }

    // ajout margo : vérifier totalCost (centimes)
 const price = Number(req.body.price); 
 const placesTotal = Number(req.body.placesTotal);

 if (!price || price <= 0) {
    return res.json({ result: false, error: "Prix invalide" });
  }

  if (!placesTotal || placesTotal <= 0) {
    //verifie que placesTotal est un nombre valide et positif
    //placesTotal <= 0 verifie si 0 ou negatif
    return res.json({ result: false, error: "placesTotal invalide" });
  }

  // calcul automatique du coût total (conducteur + 1 passager au pire cas)
  const totalCost = price * 2;

  const newRide = new Ride({
    departure: req.body.departure,
    arrival: req.body.arrival,
    date: req.body.date,
    
     price: price,

    // ajouts margaux nécessaires au paiement simulé
    placesTotal: placesTotal,
    placesLeft: placesTotal,

    totalCost: totalCost,

    status: "open",

    user: req.body.user,
  });
  
  const ride = await newRide.save();          //enregistre le ride en base
    res.json({ result: true, ride: ride });   //renvoie le ride créé au frontend
<<<<<<< HEAD
});

router.get("/search", async (req, res) => {

  const departure = req.query.departure;   // req.query car le frontend fera une requête comme : GET /rides/search?departure=Paris&arrival=Lyon
  const arrival = req.query.arrival;
  const date = req.query.date;

  const query = {
    status: "open",
    placesLeft: { $gt: 0 }
  };

  if (departure) {
    query.departure = new RegExp(departure, "i");
  }

  if (arrival) {
    query.arrival = new RegExp(arrival, "i");
  }

  if (date) {
    query.date = new Date(date);
  }

  const rides = await Ride.find(query).sort({ date: 1 });

  res.json({
    result: true,
    rides: rides
  });

=======
>>>>>>> 46d2818e16630cbeb07b9ba11163c1eead6baebe
});

router.get("/:token", async (req, res) => {    
  const user = await User.findOne({ token: req.params.token }); 
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }
    const ride = await Ride.find({ user: user._id });    //récupère tous les rides créés par cet utilisateur
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

router.post("/:id/start", async (req, res) => {
  const ride = await Ride.findById(req.params.id);

  if (!ride) {
    return res.json({ result: false, error: "Ride introuvable" });
  }

  if (ride.status !== "open") {
    return res.json({ result: false, error: "Ride non démarrable" });
  }

  const bookings = await Booking.find({
    ride: ride._id,
    status: "authorized",
  });

  if (bookings.length === 0) {
    return res.json({ result: false, error: "Aucun passager" });
  }

 // calcul du nombre total de passagers
  let n = 0;
  for (let b of bookings) {
    n += b.seatsBooked;
  }

  const finalPricePerSeat = Math.floor(ride.totalCost / (n + 1));

  if (n <= 0) {
    return res.json({ result: false, error: "Nombre de places réservées invalide" });
  }

   // chaque booking paie seatsBooked * finalPricePerSeat
  for (let b of bookings) {
    b.status = "captured";
    b.finalAmount = finalPricePerSeat * b.seatsBooked;
    await b.save();
  }

  ride.status = "started";
  await ride.save();

  res.json({
    result: true,
    passengers: n,
    pricePerSeat: finalPricePerSeat,
    message: "Prix final calculé"
  });
});

module.exports = router;
