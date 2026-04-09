const Ride = require("../models/rides");    //importe tous les modèles nécessaires à la logique trajet, un trajet n’est pas isolé, il est lie a des utilisateurs, des resa, des paiements et des messages
const User = require("../models/users");
const Booking = require("../models/bookings");
const Conversation = require("../models/conversations");
const Message = require("../models/messages");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

// HELPERS

function formatRideDateTime(date) {   //les helpers sont des petites fonctions utilitaires pour ne pas repeter du code
                              //helper pour formater les dates de manière homogène au lieu de refaire ce traitement à plusieurs endroits
  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) return "";

  const formatted = d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
 
  return formatted;      //cette fonction transforme une date brute en texte lisible
}

function getTripCategoryFromRide(ride) {  //traduit le statut technique du trajet en une catégorie simple pour le frontend : a venir, en cours, passe
  if (!ride) return "upcoming";

  if (["open", "published"].includes(ride.status)) return "upcoming";
  if (ride.status === "started") return "current";
  if (ride.status === "completed") return "past";
  if (ride.status === "cancelled") return "past";

  return "upcoming";       //centralise la traduction des statuts backend en catégories plus simples pour le frontend
}

function getPassengerTripCategory(booking) {   //pareil cote passager sauf que la categorie depend ici du statut du trajet, de la resa et de la presence ou non
  const ride = booking?.ride;

  if (!ride) return "upcoming";

  if (booking?.status === "cancelled") return "past";
  if (ride.status === "cancelled") return "past";
  if (ride.status === "completed") return "past";

  if (["scanned", "manual"].includes(booking.passengerPresenceStatus)) {
    return "current";
  }

  return "upcoming";
}

function canDriverStartRide(passengers = []) {   //dit si le conducteur peut démarrer le trajet
  if (!passengers.length) return false;

  return passengers.every((b) =>
    ["scanned", "manual", "absent"].includes(b.passengerPresenceStatus) //que si tous les passagers ont été traités
  );
}  //Parce que le démarrage déclenche aussi la logique de paiement

function normalizeUser(userDoc, isDriver = false) {  //transforme un utilisateur en objet propre et cohérent pour le frontend
  if (!userDoc) return null;

  return {      //deux logiques de nommage dans le projet : firstname/lastname et prenom/nom
    _id: userDoc._id,     //Donc cette fonction permet de renvoyer un format stable
    firstname: userDoc.firstname || "",
    lastname: userDoc.lastname || "",
    prenom: userDoc.prenom || userDoc.firstname || "",
    nom: userDoc.nom || userDoc.lastname || "",
    username: userDoc.username || "",
    email: userDoc.email || "",
    profilePhoto: userDoc.profilePhoto || null,
    ...(isDriver && { car: userDoc.car || null }),   //Si c’est un conducteur, on ajoute sa voiture
  };
}

function enrichRideForFrontend(rideDoc) {    //enrichit un trajet avec :
  if (!rideDoc) return null;

  const ride = rideDoc?.toObject ? rideDoc.toObject() : rideDoc;

  return {
    ...ride,
    driver: normalizeUser(ride.user, true),   //un conducteur propremment formate
    tripCategory: getTripCategoryFromRide(ride),   //une categorie frontend
  };
}

async function findConversationBetweenDriverAndPassenger(rideId, driverId, passengerId) {   //cherches la conversation entre le conducteur et le passager pour un trajet donné
  return Conversation.findOne({
    ride: rideId,
    $or: [   //plusieurs formes dans $or car ma structure de conversation a change au fur et a mesure
      { users: { $all: [driverId, passengerId] } },
      { participants: { $all: [driverId, passengerId] } },
      { driver: driverId, passenger: passengerId },
    ],   //la je rends donc mon code compatible avec plusieurs structures existantes
  });
}

async function createSystemMessageForCancellation({   //ne me contente pas de changer un statut en base, j'informe aussi le passager
  conversation,
  driver,
  passenger,
  ride,
}) {
  if (!conversation || !passenger?._id) return;

  const driverName =    //construit le nom du conducteur
    `${driver.prenom || driver.firstname || ""} ${driver.nom || driver.lastname || ""}`.trim();

  const rideLabel = `${ride.departureAddress || "Départ"} → ${   //construit le libelle du trajet
    ride.destinationAddress || "Arrivée"
  }`;


  const dateLabel = ride.departureDateTime    //ajoute date si dispo
    ? ` du ${formatRideDateTime(ride.departureDateTime)}`
    : "";

  const messageText =   //cree un texte systeme
    `Le conducteur ${driverName} a annulé le trajet ${rideLabel}${dateLabel}. ` +
    `Votre réservation a été annulée et le montant est de 0,00 €.`;

  const payload = {     //l'enregistre comme message
    conversation: conversation._id,
    sender: driver._id,
    type: "system",
  };

  if ("text" in Message.schema.paths) {
    payload.text = messageText;
  }

  if ("content" in Message.schema.paths) {
    payload.content = messageText;
  }

  if ("visibleTo" in Message.schema.paths) {
    payload.visibleTo = "passenger_only";
  }

  if ("readByPassenger" in Message.schema.paths) {
    payload.readByPassenger = false;
  }

  if ("readByDriver" in Message.schema.paths) {
    payload.readByDriver = true;
  }

  await Message.create(payload);

  if ("lastMessage" in conversation) {
    conversation.lastMessage = messageText;
  }

  if ("lastMessagePreviewPassenger" in conversation) {
    conversation.lastMessagePreviewPassenger = messageText;
  }

  if ("lastMessageAt" in conversation) {
    conversation.lastMessageAt = new Date();
  }

  await conversation.save();  //enregistre met a jour la conversation
}

//
// ======================
// 💰 CAPTURE PAIEMENTS
// ======================
//

async function captureRidePaymentsForPresentPassengers(rideId) { //gère la partie paiement au moment du démarrage du trajet
  const ride = await Ride.findById(rideId);  //recup le trajet

  if (!ride) {
    throw new Error("Trajet introuvable");
  }

  const bookings = await Booking.find({   //recup les bokkings autorises 
    ride: ride._id,
    status: "authorized",
  });

  const absentBookings = bookings.filter(  //separe les absents
    (b) => b.passengerPresenceStatus === "absent"
  );

  for (const booking of absentBookings) {
    if (booking.paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);  //annule les pre autorisation stripe
      } catch (err) {
      }
    }

    booking.status = "cancelled";   //marque ces bookings comme annules 
    booking.finalAmount = 0;
    booking.cancelledBy = "driver";
    booking.cancellationReason = "passenger_absent";
    booking.cancelledAt = new Date();
    await booking.save();
  }

  const presentBookings = bookings.filter((b) =>   //separe les presents
    ["scanned", "manual"].includes(b.passengerPresenceStatus)
  );

  if (presentBookings.length === 0) {    
    return { finalPricePerSeat: 0, countedPassengers: 0 };
  }

  let totalPassengers = 0;

  presentBookings.forEach((b) => {    //calcule le nombre de passagers presents 
    totalPassengers += b.seatsBooked;
  });

  const finalPricePerSeat = Math.floor(ride.totalCost / (totalPassengers + 1)); //calcule le prix final par place
                                                          // +1 cest le conducteur qui partage aussi le cout
  for (const booking of presentBookings) {
    const finalAmount = finalPricePerSeat * booking.seatsBooked;

    await stripe.paymentIntents.capture(booking.paymentIntentId, {   //capturer le montant final pour chaque passager présent
      amount_to_capture: finalAmount,
    });

    booking.status = "captured";   //enregistrer le montant final
    booking.finalAmount = finalAmount;
    await booking.save();
  }

  return { finalPricePerSeat, countedPassengers: totalPassengers };
}

//
// ======================
// CREATE RIDE
// ======================
//

exports.createRide = async (req, res) => {   //Crée un trajet
  console.time("create-ride");

  try {
    const {   //on récupère tout ce qu’il faut
      token,
      departureAddress,
      destinationAddress,
      departureLatitude,
      departureLongitude,
      destinationLatitude,
      destinationLongitude,
      departureDateTime,
      pickupWalkMinutes,
      dropoffWalkMinutes,
      price,
      availableSeats,
    } = req.body;

    if (  //on verifie les champs obligatoires
      !token ||
      !departureAddress ||
      !destinationAddress ||
      departureLatitude === undefined ||
      departureLongitude === undefined ||
      destinationLatitude === undefined ||
      destinationLongitude === undefined ||
      !departureDateTime
    ) {
      console.timeEnd("create-ride");
      return res.json({ result: false, error: "Champs manquants." });
    }

    const user = await User.findOne({ token });  //on retrouve l utilisateur car le trajet doit être relié à un conducteur

    if (!user) {
      console.timeEnd("create-ride");
      return res.json({ result: false, error: "User introuvable" });
    }

    const seats = Math.max(Number(availableSeats) || 1, 1); //au moins une place
    const priceValue = Math.max(Number(price) || 0, 0); //pas de prix negatif

    const parsedDepartureDate = new Date(departureDateTime);  //analyse la représentation sous forme de chaîne de caractères d'une date et renvoie l'horodatage correspondant

    const newRide = new Ride({  //cree le trajet
      user: user._id,
      departureAddress,
      destinationAddress,
      departureLatitude,
      departureLongitude,
      destinationLatitude,
      destinationLongitude,
      departureDateTime: parsedDepartureDate,
      pickupWalkMinutes: Number(pickupWalkMinutes) || 0,
      dropoffWalkMinutes: Number(dropoffWalkMinutes) || 0,
      price: priceValue,
      placesTotal: seats,
      placesLeft: seats,
      totalCost: Math.round(priceValue * 100),
      status: "published",
    });

    const savedRide = await newRide.save();

    const populated = await Ride.findById(savedRide._id).populate(  //recharger avec populate
      "user",                                                //pour renvoyer un objet enrichi au frontend
      "prenom nom firstname lastname profilePhoto car"
    );

    console.timeEnd("create-ride");

    return res.json({
      result: true,
      ride: enrichRideForFrontend(populated),
    });
  } catch (error) {
    console.error("CREATE RIDE ERROR =", error);
    console.timeEnd("create-ride");
    return res.status(500).json({ result: false, error: error.message });
  }
};

//
// ======================
// DRIVER TRIPS
// ======================
//

exports.getDriverTrips = async (req, res) => {   //recuperer les trajets du conducteur
  console.time("driver-trips");

  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      console.timeEnd("driver-trips");
      return res.json({ result: false });
    }

    const rides = await Ride.find({ user: user._id })
      .populate("user", "prenom nom firstname lastname profilePhoto car")
      .sort({ departureDateTime: -1 })
      .lean();

    const enriched = [];

    for (const rideDoc of rides) {
      const bookings = await Booking.find({
        ride: rideDoc._id,
        status: { $in: ["authorized", "captured", "cancelled"] },
      })
        .populate("user", "prenom nom firstname lastname profilePhoto")
        .lean();

      const passengers = bookings.map((b) => ({
        ...b,
        passenger: normalizeUser(b.user),
      }));

      const ride = enrichRideForFrontend(rideDoc);

      enriched.push({
        ...ride,
        passengers,
        canStartRide: canDriverStartRide(
          passengers.filter((p) => p.status !== "cancelled")
        ),
      });
    }

    console.timeEnd("driver-trips");
    return res.json({ result: true, rides: enriched });
  } catch (error) {
    console.error("GET DRIVER TRIPS ERROR =", error);
    console.timeEnd("driver-trips");
    return res.status(500).json({ result: false, error: "Erreur serveur" });
  }
};
//c est bien comme ca le frontend conducteur recoit directement les trajets, les passagers et le statut du demarrage possible,, pas ebsoind e refaire les calculs

//
// ======================
// BOOKINGS PASSAGER
// ======================
//

exports.getPassengerBookings = async (req, res) => {   //recup les resa du passager
  console.time("passenger-bookings");

  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      console.timeEnd("passenger-bookings");
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    const bookings = await Booking.find({
      user: user._id,
      status: { $in: ["authorized", "captured", "cancelled"] },
    })
      .select(
        "_id ride user seatsBooked status paymentIntentId maxAmount finalAmount passengerPresenceStatus scannedAt manualValidatedAt absentMarkedAt createdAt updatedAt message cancelledBy cancellationReason cancelledAt"
      )
      .lean();

    const rideIds = bookings.map((b) => b.ride).filter(Boolean);

    const rides = await Ride.find({
      _id: { $in: rideIds },
    })
      .select(
        "_id departureAddress destinationAddress departureDateTime status user placesLeft price departureLatitude departureLongitude destinationLatitude destinationLongitude"
      )
      .populate("user", "prenom nom firstname lastname profilePhoto car")
      .lean();

    const ridesById = new Map(rides.map((ride) => [String(ride._id), ride]));

    const result = bookings
      .map((booking) => {
        const ride = ridesById.get(String(booking.ride));

        if (!ride) return null;

        const enrichedRide = {
          ...ride,
          driver: {
            _id: ride.user?._id || null,
            prenom: ride.user?.prenom || ride.user?.firstname || "",
            nom: ride.user?.nom || ride.user?.lastname || "",
            profilePhoto: ride.user?.profilePhoto || null,
            car: ride.user?.car || null,
          },
          tripCategory: getTripCategoryFromRide(ride),
        };

        return {
          ...booking,
          ride: enrichedRide,
          tripCategory: getPassengerTripCategory({
            ...booking,
            ride: enrichedRide,
          }),
        };
      })
      .filter(Boolean);

    console.timeEnd("passenger-bookings");

    return res.json({ result: true, bookings: result });
  } catch (error) {
    console.error("GET PASSENGER BOOKINGS ERROR =", error);
    console.timeEnd("passenger-bookings");

    return res.status(500).json({
      result: false,
      error: error.message,
    });
  }
};
//structure spécifique pour le passager, car il a besoin de voir non seulement sa réservation, mais aussi le trajet, le conducteur et l’état courant du déplacement



// ACTIONS PASSAGER
 
async function updatePresence(bookingId, status) {  //Mettre à jour le statut de présence d’un passager
  const booking = await Booking.findById(bookingId).populate("ride");

  if (!booking) {
    throw new Error("Booking introuvable");
  }

  booking.passengerPresenceStatus = status;
  booking.scannedAt = status === "scanned" ? new Date() : null;
  booking.manualValidatedAt = status === "manual" ? new Date() : null;
  booking.absentMarkedAt = status === "absent" ? new Date() : null;
//au lieu de faire 3 fois le même code, je fais une seule fonction commune
  await booking.save();

  return booking;
}


exports.scanPassengerBooking = async (req, res) => {  //met le statut a scanned
  try {
    const booking = await updatePresence(req.params.bookingId, "scanned");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};


exports.validatePassengerManually = async (req, res) => {   //met le statut a manual
  try {
    const booking = await updatePresence(req.params.bookingId, "manual");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};


exports.markPassengerAbsent = async (req, res) => {   //met le statut a absent
  try {
    const booking = await updatePresence(req.params.bookingId, "absent");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};


// START RIDE

exports.startRide = async (req, res) => {   //demarre un trajet
  console.time("start-ride");

  try {
    const ride = await Ride.findById(req.params.id); //trouve le trajet

    if (!ride) {
      console.timeEnd("start-ride");
      return res.json({ result: false });
    }

    const bookings = await Booking.find({  //recup les bookings actifs
      ride: ride._id,
      status: { $in: ["authorized", "captured"] },
    });

    const ready =   //vérifie si tous les passagers ont été traités
      bookings.length > 0 &&
      bookings.every((b) =>
        ["scanned", "manual", "absent"].includes(b.passengerPresenceStatus)
      );

    if (!ready) {
      console.timeEnd("start-ride");
      return res.json({
        result: false,
        error: "Tous les passagers doivent être validés",
      });
    }

    const paymentSummary = await captureRidePaymentsForPresentPassengers(  //capture les paiements
      ride._id
    );

    ride.status = "started";   //passer le trajet à started
    await ride.save();

    console.timeEnd("start-ride");

    return res.json({
      result: true,
      ride,
      paymentSummary,
    });
  } catch (e) {
    console.error("START RIDE ERROR =", e);
    console.timeEnd("start-ride");
    return res.status(500).json({ result: false, error: e.message });
  }
};


// CANCEL RIDE

exports.cancelRide = async (req, res) => {   //Permet au conducteur d’annuler un trajet à venir
  console.time("cancel-ride");

  try {
    const { id } = req.params;
    const { token } = req.body;

    if (!token) {
      console.timeEnd("cancel-ride");
      return res.status(400).json({
        result: false,
        error: "Token manquant.",
      });
    }

    const driver = await User.findOne({ token });

    if (!driver) {
      console.timeEnd("cancel-ride");
      return res.status(404).json({
        result: false,
        error: "Conducteur introuvable.",
      });
    }

    const ride = await Ride.findOne({
      _id: id,
      user: driver._id,
    });

    if (!ride) {
      console.timeEnd("cancel-ride");
      return res.status(404).json({
        result: false,
        error: "Trajet introuvable.",
      });
    }

    if (!["published", "open"].includes(ride.status)) {
      console.timeEnd("cancel-ride");
      return res.status(400).json({
        result: false,
        error: "Seul un trajet à venir peut être annulé.",
      });
    }

    const bookings = await Booking.find({
      ride: ride._id,
      status: { $in: ["authorized", "captured"] },
    }).populate("user", "prenom nom firstname lastname profilePhoto");

    for (const booking of bookings) {
      if (booking.paymentIntentId) {
        try {
          if (booking.status === "authorized") {
            await stripe.paymentIntents.cancel(booking.paymentIntentId);
          } else if (booking.status === "captured") {
            await stripe.refunds.create({
              payment_intent: booking.paymentIntentId,
            });
          }
        } catch (stripeError) {
        }
      }

      booking.status = "cancelled";
      booking.finalAmount = 0;
      booking.cancelledBy = "driver";
      booking.cancellationReason = "driver_cancelled";
      booking.cancelledAt = new Date();
      await booking.save();

      const passenger = booking.user;

      if (passenger?._id) {
        const conversation = await findConversationBetweenDriverAndPassenger(
          ride._id,
          driver._id,
          passenger._id
        );

        if (conversation) {
          await createSystemMessageForCancellation({
            conversation,
            driver,
            passenger,
            ride,
          });
        }
      }
    }

    ride.status = "cancelled";
    await ride.save();

    console.timeEnd("cancel-ride");

    return res.json({
      result: true,
      message: "Trajet annulé avec succès.",
      ride,
    });
  } catch (error) {
    console.error("CANCEL RIDE ERROR =", error);
    console.timeEnd("cancel-ride");

    return res.status(500).json({
      result: false,
      error: error.message || "Erreur serveur.",
    });
  }
};
// gère l’annulation de bout en bout : statut trajet, statut resa, paiement et communication



// UPDATE LOCATION : PATCh comme PUT mais pour mettre à jour PARTIELLEMENT une ressource

exports.updateRideLocation = async (req, res) => {  //met à jour la position du conducteur pendant le trajet
  //exportes une fonction contrôleur

  try {
    const { id } = req.params;   //’id du trajet (/rides/:id)
    const { token, latitude, longitude } = req.body; //’id du trajet (/rides/:id

    const user = await User.findOne({ token }).select("_id"); //cherches l’utilisateur avec le token
                                         //récupères seulement l’id pas tout l'objet user
    if (!user) {
      return res.status(404).json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const ride = await Ride.findOne({ //2 vérifications en une seule requête :
      _id: id,  //  bon trajet
      user: user._id,  //appartient a cet utilisateur
    });    //personne ne peut modifier le trajet d’un autre

    if (!ride || ride.status !== "started") { //trajet inexistant ou pas à lui || trajet pas encore commencé
      return res.status(400).json({ result: false }); //on ne met à jour la position QUE pendant le trajet
    }

    ride.currentLatitude = latitude; //modif de ces 3 champs seulement 
    ride.currentLongitude = longitude;
    ride.locationUpdatedAt = new Date();

    await ride.save();

    return res.json({ result: true, ride });
  } catch (error) {
    console.error("UPDATE RIDE LOCATION ERROR =", error);
    return res.status(500).json({ result: false, error: error.message });
  }
};