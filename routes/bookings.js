var express = require("express");
var router = express.Router();

const Booking = require("../models/bookings");
const User = require("../models/users");
const Ride = require("../models/rides");

router.get("/", (req, res) => {
  Booking.find()
    .populate("user", "ride")
    .then((getBookings) => {
      res.json({ result: true, bookings: getBookings });
    });
});

router.get("/:token", (req, res) => {
  User.findOne({ token: req.params.token }).then((user) => {
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }
    Booking.find({ user: user._id })
      .populate("user", "ride")
      .then((getBookings) => {
        res.json({ result: true, bookings: getBookings});
      });
  });
});

router.post("/add", (req, res) => {
  User.findOne({ token: req.body.token }).then((user) => {
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const newBooking = new Booking({
      message: req.body.message,
      status: req.body.status || "pending", // "pending" par défaut si vide
      ride: req.body.ride,
      user: user._id,
    });
    newBooking.save().then((savedBooking) => {
      res.json({ result: true, booking: savedBooking });
    });
  });
});

router.delete("/delete/:bookingId", (req, res) => {
  // On utilise le token passé dans l'URL (params) pour savoir qui supprimer
  Booking.deleteOne({ _id: req.params.bookingId }).then((data) => {
    // deletedCount vaut 1 si quelqu'un a été supprimé, 0 sinon
    if (data.deletedCount > 0) {
      res.json({ result: true, message: "Réservation supprimé avec succès" });
    } else {
      res.json({ result: false, error: "Utilisateur non trouvé" });
    }
  });
});

// route qui sert à modifier le statut de la réservation, (accepter ou refuser)
router.put("/updateStatus", (req, res) => {
  // On cherche le booking par son ID envoyé dans le body
  Booking.findById(req.body.bookingId).then((data) => {
    if (data) {
      data.status = req.body.status; // On met à jour le statut
      data.save().then((updatedBooking) => {
        res.json({ result: true, booking: updatedBooking });
      });
    } else {
      res.json({ result: false, error: "Booking non trouvé" });
    }
  });
});


module.exports = router;
