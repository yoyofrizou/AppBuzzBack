const express = require('express');     //librairie qui permet de creer des routes (API backend)
const router = express.Router();       //va contenir toutes les routes liées aux rides et sera branche dans app.js
const Ride = require("../models/rides");   // import du modele Ride pour pouvoir creer un trajet, lire un trajet ou supprimer un trajet
const User = require("../models/users");   //pour retrouver un utilisateur avec son token
const Booking = require("../models/bookings");

router.post("/add", async (req, res) => {   //l’URL finale est POST /rides/add
  if (
  !req.body.departure ||
  !req.body.arrival ||
  !req.body.date ||
  !req.body.price ||
  !req.body.placesTotal ||
  !req.body.totalCost ||
  !req.body.user ||
  !req.body.driver
) {    //verifie que tous les champs sont présents, si le champ est vide, undefined ou null alors ca bloque
    return res.json({
      result: false,
      error: "Remplir tous les champs.",   //manque qq chose
    });
  }

    // ajout margo : vérifier totalCost (centimes)
  const placesTotal = Number(req.body.placesTotal);   //transforme la valeur envoyée en Number car souvent envoyee par le front en string
  const totalCost = Number(req.body.totalCost);      //pareil

  if (!placesTotal || placesTotal <= 0) {      //verifie que placesTotal est un nombre valide et positif
                                              //placesTotal <= 0 verifie si 0 ou negatif
    return res.json({ result: false, error: "placesTotal invalide" });
  }

  if (!totalCost || totalCost <= 0) {
    return res.json({ result: false, error: "totalCost invalide" });
  }

  const newRide = new Ride({          //nouvelle instance du modèle Ride
    departure: req.body.departure,     //récupère les valeurs envoyées par le frontend
    arrival: req.body.arrival,
    date: req.body.date,
    price: req.body.price,

    // ajouts margaux nécessaires au paiement simulé
    placesTotal: placesTotal,
    placesLeft: placesTotal,
    totalCost: totalCost,
    status: "open",

    user: req.body.user,
    driver: req.body.driver,    //stocke les références MongoDB
  });
  
  const ride = await newRide.save()           //enregistre le ride en base
    res.json({ result: true, ride: ride });   //renvoie le ride créé au frontend
});

router.get("/:token", async (req, res) => {     //Route dynamique, ex : GET /rides/abc123token
  const user = await User.findOne({ token: req.params.token }); // cherche l’utilisateur avec ce token
    if (!user) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }
    const ride = await Ride.find({ user: user._id })    //récupère tous les rides créés par cet utilisateur
      res.json({ result: true, rides: ride });
});


router.delete("/delete/:rideId", async (req, res) => {     //supprime un ride par son ID
  const ride = await Ride.deleteOne({ _id: req.params.rideId })    //supprime en BBD, Mongo ne renvoie pas le ride supprimé, il renvoie un résultat qui indique ce qui s’est passé
                                                                  //Mongo renvoie un objet comme ceci { "acknowledged": true, "deletedCount": 1}
    if (ride.deletedCount > 0) {       //“Est-ce que Mongo a vraiment supprimé quelque chose ?”
                                      // deletedCount signifie combien de documents ont été supprimés donc if “Si au moins un ride a été supprimé”
                                       // 1 > 0 → true alors le code entre dans le if, resultat = trajet supp
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

  // ✅ n = total de places réservées (multi-places)
  let n = 0;
  for (let b of bookings) {
    n += b.seatsBooked;
  }

  if (n <= 0) {
    return res.json({ result: false, error: "Nombre de places réservées invalide" });
  }

 // prix final par place : totalCost / (n + conducteur)
  const finalAmountPerSeat = Math.floor(ride.totalCost / (n + 1));

   // chaque booking paie seatsBooked * finalAmountPerSeat
  for (let b of bookings) {
    b.status = "captured";
    b.finalAmount = finalAmountPerSeat * b.seatsBooked;
    await b.save();
  }

  ride.status = "started";
  await ride.save();

  res.json({
    result: true,
    message: "Trajet démarré : prix final calculé (simulation)",
    seatsBookedTotal: n,
    finalAmountPerSeat: finalAmountPerSeat,
  });
});

module.exports = router;