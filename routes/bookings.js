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

router.post("/add", (req, res) => {       //crée une route POST donc on envoie des donnees, add c est le chemin dans ce fichier, URL POST /bookings/add
  User.findOne({ token: req.body.token }).then((user) => {      //cherche un seul utilisateur, celui dont le champ token correspond à ce que l’app a envoyé, quand MongoDB a fini, il donne le résultat dans user
                                   //Parce que tu veux réserver en sachant qui réserve, donc tu identifies l’utilisateur
    if (!user) {          //Mongo n’a rien trouvé donc user vaut null
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

     Ride.findById(req.body.ride).then((ride) => {        //cherche le trajet par son _id
                                                       //Parce que la réservation doit être liée à un trajet précis
      if (!ride) {         //si l’ID est faux ou supprimé alors Mongo renvoie null
        return res.json({ result: false, error: "Trajet non trouvé" });
      }

      if (ride.status !== "open") {       //vérifie le champ status du ride, "open" = trajet disponible sinon "started" ou "cancelled", on refuse
                                         //On ne réserve pas un trajet qui a déjà commencé / fini / annulé
        return res.json({ result: false, error: "Le trajet n'est plus réservable" });
      }

       // nombre de places demandées (par défaut 1)
      const seatsBooked = req.body.seatsBooked ? Number(req.body.seatsBooked) : 1;   // req ce que le frontend envoie dans le body JSON, et transforme ce que le frontend envoie en nombre car souvent les formulaires envoient des strings
                                    /*si req.body.seatsBooked est absent → Number(undefined) → NaN → donc on prend 1
                                    si req.body.seatsBooked vaut "abc" → Number("abc") → NaN → donc on prend 1
                                    donc si le front n’envoie rien ou envoie un truc mauvais, on réserve 1 place par défaut*/
      if (seatsBooked <= 0) {    //vérifie que le nombre est valide parce qu’un utilisateur ne doit pas pouvoir réserver 0 place ou un nombre negatif
        return res.json({ result: false, error: "Nombre de places invalide" });
      }

      if (ride.placesLeft <= 0) {       //impossible de dépasser le nombre de places
        return res.json({ result: false, error: "Plus de places disponibles" });
      }

      // 💰 simulation préautorisation (pire cas = 1 passager)
      const pricePerSeatMax = Math.floor(ride.totalCost / 2);
      const maxAmount = pricePerSeatMax * seatsBooked; //coût total du trajet (en centimes)
                                                   // / 2 : pire cas = 1 seul passager + le conducteur → partage en 2
                                                   //Math.floor() : on arrondit à l’entier inférieur, pas de centimes avec virgule
                                                   //Parce qu’au moment de la réservation, on ne sait pas combien de passagers il y aura au final donc on “bloque” virtuellement le maximum possible : preauthorisation
    });

    const newBooking = new Booking({    //crée un nouveau document Booking en memoire
      message: req.body.message,         //stocke un message optionnel
      status: req.body.status || "authorized", //force le statut à "authorized", qui ici veut dire : réservation créée + préautorisation simulée faite
      user: user._id,
      seatsBooked: seatsBooked,
      maxAmount: maxAmount,
      finalAmount: null,
    });
    newBooking.save().then((savedBooking) => {
 // retirer une place dans le ride
        ride.placesLeft = ride.placesLeft - 1;
       ride.save().then(() => {
          res.json({
            result: true,
            booking: savedBooking,
            seatsBooked: seatsBooked,
            maxAmount: maxAmount,
            message: "Préautorisation simulée effectuée"
    });
        });

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
