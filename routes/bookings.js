const express = require("express");
const router = express.Router();   //crée le router des réservations
const Stripe = require("stripe"); //import stripe parce que l’annulation d’un booking peut déclencher une annulation de préautorisation

const Booking = require("../models/bookings");  //importe tous les objets liés à la réservation
const User = require("../models/users");
const Ride = require("../models/rides");
const Conversation = require("../models/conversations");
const Message = require("../models/messages");
const connectDB = require("../config/connectDB");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

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


function formatRideDateTimeForMessage(date) {   //formates la date du trajet pour l’utiliser dans les messages de conversation
  if (!date) {
    return { formattedDate: "", formattedTime: "" };
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return { formattedDate: "", formattedTime: "" };
  }

  return {
    formattedDate: d.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    formattedTime: d.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

//
// GET tous les bookings (debug)
//
router.get("/", async (req, res) => {   //Récupére tous les bookings, debug
  try {
    const bookings = await Booking.find()
      .populate("user", "firstname lastname username email")
      .populate("ride");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});


// recupere les bookings de l'utilisateur connecté via son token
router.get("/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const bookings = await Booking.find({ user: user._id })
      .populate("ride")
      .populate("user", "firstname lastname username email")
      .sort({ createdAt: -1 });

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});


// crée une réservation
router.post("/add", async (req, res) => {
  try {
    const {
      token,
      ride: rideId,
      seatsBooked = 1,
      message = "",
      paymentIntentId,
      maxAmount,
    } = req.body;

    if (!token || !rideId || !paymentIntentId || !maxAmount) {  //je ne veux pas créer de réservation incomplète
      return res.json({
        result: false,
        error: "Champs manquants",
      });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const ride = await Ride.findById(rideId).populate(
      "user",
      "firstname lastname prenom nom username profilePhoto car averageRating"
    );

    if (!ride) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }

    if (String(ride.user?._id) === String(user._id)) {
      return res.json({
        result: false,
        error: "Vous ne pouvez pas réserver votre propre trajet",
      });
    }

    if (ride.status !== "open" && ride.status !== "published") {  //Un trajet commencé, terminé ou annulé ne doit plus être réservable
      return res.json({
        result: false,
        error: "Le trajet n'est plus réservable",
      });
    }

    const parsedSeatsBooked = Number(seatsBooked) || 1;  //protège la capacité du trajet

    if (parsedSeatsBooked <= 0) {
      return res.json({
        result: false,
        error: "Nombre de places invalide",
      });
    }

    if (ride.placesLeft < parsedSeatsBooked) {
      return res.json({
        result: false,
        error: "Pas assez de places disponibles",
      });
    }

    const existingBooking = await Booking.findOne({   //vérifie qu’il n’a pas déjà réservé ce trajet
      ride: ride._id,
      user: user._id,
    });

    if (existingBooking) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    // empêche un passager d’avoir un autre trajet déjà en cours
    const passengerBookings = await Booking.find({
      user: user._id,
      status: { $in: ["authorized", "captured"] },  //authorisez car le paiement a déjà été préautorisé avant via /payments
    }).populate({
      path: "ride",
      select: "_id status departureAddress destinationAddress departureDateTime",
    });

    const currentStartedBooking = passengerBookings.find(
      (booking) =>
        booking?.ride &&
        String(booking.ride._id) !== String(ride._id) &&
        booking.ride.status === "started"
    );

    if (currentStartedBooking) {
      return res.json({
        result: false,
        error: "Vous avez déjà un trajet en cours. Impossible de réserver un autre trajet pour le moment.",
      });
    }

    const newBooking = new Booking({
      message,
      status: "authorized",
      ride: ride._id,
      user: user._id,
      seatsBooked: parsedSeatsBooked,
      maxAmount: Number(maxAmount),
      finalAmount: null,   //montant final n’est pas encore connu à ce moment-là
      paymentIntentId,
    });

    const savedBooking = await newBooking.save();

    ride.placesLeft = ride.placesLeft - parsedSeatsBooked;
    await ride.save();     //la resa a un impact immédiat sur la disponibilité du trajet

    const driver = ride.user;  //cherche une conversation existante ou bien je la crées

    if (!driver) {
      return res.json({
        result: false,
        error: "Conducteur du trajet introuvable",
      });
    }

    const passengerFullName = `${user.firstname || ""} ${user.lastname || ""}`.trim();
    const driverFullName = `${driver.firstname || ""} ${driver.lastname || ""}`.trim();

    let conversation = await Conversation.findOne({
      ride: ride._id,
      driver: driver._id,  //construis deux messages : un pour le driver et un pour le passager
      passenger: user._id,
    });

    const { formattedDate, formattedTime } = formatRideDateTimeForMessage(
      ride.departureDateTime
    );

    const departureText = ride.departureAddress || "";
    const destinationText = ride.destinationAddress || "";

    const passengerRating =
      typeof user.passengerAverageRating === "number"
        ? user.passengerAverageRating.toFixed(1)
        : "N/A";

   const driverMessage =
  `Bonjour, ${user.firstname || "Un passager"} ⭐ ${passengerRating} vient de réserver une place sur votre trajet ${departureText} → ${destinationText}, prévu le ${formattedDate} à ${formattedTime}.` +
  (message ? `\nMessage du passager : "${message}"` : "");

    const passengerMessage =
      `Merci d’avoir réservé votre trajet avec ${driverFullName}. Vous pouvez lui écrire via ce chat si besoin.`;

    if (!conversation) {
      conversation = await Conversation.create({
        ride: ride._id,
        driver: driver._id,
        passenger: user._id,
        driverName: driverFullName,
        passengerName: passengerFullName,
        lastMessagePreviewDriver: driverMessage,
        lastMessagePreviewPassenger: passengerMessage,
        lastMessageAt: new Date(),
      });
    } else {
      conversation.lastMessagePreviewDriver = driverMessage;
      conversation.lastMessagePreviewPassenger = passengerMessage;
      conversation.lastMessageAt = new Date();
      await conversation.save();
    }

    await Message.create({
      conversation: conversation._id,
      type: "system",
      sender: null,
      content: driverMessage,
      visibleTo: "driver_only",
    });

    await Message.create({
      conversation: conversation._id,
      type: "system",
      sender: null,
      content: passengerMessage,
      visibleTo: "passenger_only",
    });

    res.json({     //Le frontend récupère le booking, la conversation a ouvrir si besoin et un message clair
      result: true,
      booking: savedBooking,
      conversationId: conversation._id,
      message: "Réservation créée avec succès",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    res.json({
      result: false,
      error: err.message || "Erreur lors de la réservation",
    });
  }
});


// DELETE supprimer une réservation

router.delete("/delete/:bookingId/:token", async (req, res) => {   //pour que le passager puisse annuler sa resa
  try {
    const { bookingId, token } = req.params;

    const user = await User.findOne({ token }); //retrouve l utilisateur

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur non trouvé",
      });
    }

    const booking = await Booking.findById(bookingId);   //retrouve la resa

    if (!booking) {
      return res.json({
        result: false,
        error: "Réservation non trouvée",
      });
    }

    if (String(booking.user) !== String(user._id)) {   //verif que la resa appartient bien au user
      return res.json({
        result: false,
        error: "Vous ne pouvez pas annuler cette réservation",
      });
    }

    if (booking.status === "captured") {   // bloque si deja capturer
      return res.json({
        result: false,
        error: "Impossible d'annuler une réservation déjà capturée.",
      });
    }

    if (booking.paymentIntentId && booking.status === "authorized") {  //annule paiement si autorise
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {}
    }

    const ride = await Ride.findById(booking.ride);    //remettre la place libre
    if (ride) {
      ride.placesLeft = ride.placesLeft + booking.seatsBooked;
      await ride.save();
    }

    booking.status = "cancelled";   //passer le trajet a cancelled
    booking.finalAmount = 0;
    booking.cancelledBy = "passenger";
    booking.cancellationReason = "passenger_cancelled";
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({
      result: true,
      message: "Réservation annulée avec succès",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;