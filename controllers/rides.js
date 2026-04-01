const Ride = require("../models/rides");
const User = require("../models/users");
const Booking = require("../models/bookings");
const Conversation = require("../models/conversations");
const Message = require("../models/messages");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

//
// ======================
// HELPERS
// ======================
//

function formatRideDateTime(date) {
  if (!date) {
    console.log("FORMAT RIDE DATE TIME => date manquante");
    return "";
  }

  const d = new Date(date);

  console.log("FORMAT RIDE DATE TIME => input =", date);
  console.log("FORMAT RIDE DATE TIME => parsed =", d);
  console.log(
    "FORMAT RIDE DATE TIME => parsed ISO =",
    Number.isNaN(d.getTime()) ? "invalid date" : d.toISOString()
  );

  if (Number.isNaN(d.getTime())) return "";

  const formatted = d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  console.log("FORMAT RIDE DATE TIME => formatted =", formatted);

  return formatted;
}

function getTripCategoryFromRide(ride) {
  if (!ride) return "upcoming";

  if (["open", "published"].includes(ride.status)) return "upcoming";
  if (ride.status === "started") return "current";
  if (ride.status === "completed") return "past";
  if (ride.status === "cancelled") return "past";

  return "upcoming";
}

function getPassengerTripCategory(booking) {
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

function canDriverStartRide(passengers = []) {
  if (!passengers.length) return false;

  return passengers.every((b) =>
    ["scanned", "manual", "absent"].includes(b.passengerPresenceStatus)
  );
}

function normalizeUser(userDoc, isDriver = false) {
  if (!userDoc) return null;

  return {
    _id: userDoc._id,
    firstname: userDoc.firstname || "",
    lastname: userDoc.lastname || "",
    prenom: userDoc.prenom || userDoc.firstname || "",
    nom: userDoc.nom || userDoc.lastname || "",
    username: userDoc.username || "",
    email: userDoc.email || "",
    profilePhoto: userDoc.profilePhoto || null,
    ...(isDriver && { car: userDoc.car || null }),
  };
}

function enrichRideForFrontend(rideDoc) {
  if (!rideDoc) return null;

  const ride = rideDoc?.toObject ? rideDoc.toObject() : rideDoc;

  return {
    ...ride,
    driver: normalizeUser(ride.user, true),
    tripCategory: getTripCategoryFromRide(ride),
  };
}

async function findConversationBetweenDriverAndPassenger(rideId, driverId, passengerId) {
  return Conversation.findOne({
    ride: rideId,
    $or: [
      { users: { $all: [driverId, passengerId] } },
      { participants: { $all: [driverId, passengerId] } },
      { driver: driverId, passenger: passengerId },
    ],
  });
}

async function createSystemMessageForCancellation({
  conversation,
  driver,
  passenger,
  ride,
}) {
  if (!conversation || !passenger?._id) return;

  const driverName =
    `${driver.prenom || driver.firstname || ""} ${driver.nom || driver.lastname || ""}`.trim();

  const rideLabel = `${ride.departureAddress || "Départ"} → ${
    ride.destinationAddress || "Arrivée"
  }`;

  console.log("CANCEL MESSAGE => ride.departureDateTime brut =", ride.departureDateTime);
  console.log(
    "CANCEL MESSAGE => ride.departureDateTime ISO =",
    ride.departureDateTime ? new Date(ride.departureDateTime).toISOString() : null
  );

  const dateLabel = ride.departureDateTime
    ? ` du ${formatRideDateTime(ride.departureDateTime)}`
    : "";

  const messageText =
    `Le conducteur ${driverName} a annulé le trajet ${rideLabel}${dateLabel}. ` +
    `Votre réservation a été annulée et le montant est de 0,00 €.`;

  console.log("CANCEL MESSAGE => dateLabel =", dateLabel);
  console.log("CANCEL MESSAGE => final message =", messageText);

  const payload = {
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

  await conversation.save();
}

//
// ======================
// 💰 CAPTURE PAIEMENTS
// ======================
//

async function captureRidePaymentsForPresentPassengers(rideId) {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new Error("Trajet introuvable");
  }

  const bookings = await Booking.find({
    ride: ride._id,
    status: "authorized",
  });

  const absentBookings = bookings.filter(
    (b) => b.passengerPresenceStatus === "absent"
  );

  for (const booking of absentBookings) {
    if (booking.paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {
        console.log("Erreur annulation Stripe absent =", err.message);
      }
    }

    booking.status = "cancelled";
    booking.finalAmount = 0;
    booking.cancelledBy = "driver";
    booking.cancellationReason = "passenger_absent";
    booking.cancelledAt = new Date();
    await booking.save();
  }

  const presentBookings = bookings.filter((b) =>
    ["scanned", "manual"].includes(b.passengerPresenceStatus)
  );

  if (presentBookings.length === 0) {
    return { finalPricePerSeat: 0, countedPassengers: 0 };
  }

  let totalPassengers = 0;

  presentBookings.forEach((b) => {
    totalPassengers += b.seatsBooked;
  });

  const finalPricePerSeat = Math.floor(ride.totalCost / (totalPassengers + 1));

  for (const booking of presentBookings) {
    const finalAmount = finalPricePerSeat * booking.seatsBooked;

    await stripe.paymentIntents.capture(booking.paymentIntentId, {
      amount_to_capture: finalAmount,
    });

    booking.status = "captured";
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

exports.createRide = async (req, res) => {
  console.time("create-ride");

  try {
    const {
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

    console.log("CREATE RIDE => departureDateTime reçu =", departureDateTime);
    console.log(
      "CREATE RIDE => departureDateTime parsé =",
      departureDateTime ? new Date(departureDateTime) : null
    );
    console.log(
      "CREATE RIDE => departureDateTime ISO =",
      departureDateTime ? new Date(departureDateTime).toISOString() : null
    );

    if (
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

    const user = await User.findOne({ token });

    if (!user) {
      console.timeEnd("create-ride");
      return res.json({ result: false, error: "User introuvable" });
    }

    const seats = Math.max(Number(availableSeats) || 1, 1);
    const priceValue = Math.max(Number(price) || 0, 0);

    const parsedDepartureDate = new Date(departureDateTime);

    console.log("CREATE RIDE => parsedDepartureDate =", parsedDepartureDate);
    console.log(
      "CREATE RIDE => parsedDepartureDate ISO =",
      Number.isNaN(parsedDepartureDate.getTime())
        ? "invalid date"
        : parsedDepartureDate.toISOString()
    );
    console.log(
      "CREATE RIDE => parsedDepartureDate locale FR =",
      Number.isNaN(parsedDepartureDate.getTime())
        ? "invalid date"
        : parsedDepartureDate.toLocaleString("fr-FR", {
            timeZone: "Europe/Paris",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
    );

    const newRide = new Ride({
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

    console.log("CREATE RIDE => savedRide.departureDateTime =", savedRide.departureDateTime);
    console.log(
      "CREATE RIDE => savedRide.departureDateTime ISO =",
      savedRide.departureDateTime
        ? new Date(savedRide.departureDateTime).toISOString()
        : null
    );

    const populated = await Ride.findById(savedRide._id).populate(
      "user",
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

exports.getDriverTrips = async (req, res) => {
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

//
// ======================
// BOOKINGS PASSAGER
// ======================
//

exports.getPassengerBookings = async (req, res) => {
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

    console.log("PASSENGER BOOKINGS COUNT =", result.length);
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

//
// ======================
// ACTIONS PASSAGER
// ======================
//

async function updatePresence(bookingId, status) {
  const booking = await Booking.findById(bookingId).populate("ride");

  if (!booking) {
    throw new Error("Booking introuvable");
  }

  booking.passengerPresenceStatus = status;
  booking.scannedAt = status === "scanned" ? new Date() : null;
  booking.manualValidatedAt = status === "manual" ? new Date() : null;
  booking.absentMarkedAt = status === "absent" ? new Date() : null;

  await booking.save();

  return booking;
}

exports.scanPassengerBooking = async (req, res) => {
  try {
    const booking = await updatePresence(req.params.bookingId, "scanned");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};

exports.validatePassengerManually = async (req, res) => {
  try {
    const booking = await updatePresence(req.params.bookingId, "manual");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};

exports.markPassengerAbsent = async (req, res) => {
  try {
    const booking = await updatePresence(req.params.bookingId, "absent");
    return res.json({ result: true, booking });
  } catch (e) {
    return res.status(500).json({ result: false, error: e.message });
  }
};

//
// ======================
// START RIDE
// ======================
//

exports.startRide = async (req, res) => {
  console.time("start-ride");

  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      console.timeEnd("start-ride");
      return res.json({ result: false });
    }

    const bookings = await Booking.find({
      ride: ride._id,
      status: { $in: ["authorized", "captured"] },
    });

    const ready =
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

    const paymentSummary = await captureRidePaymentsForPresentPassengers(
      ride._id
    );

    ride.status = "started";
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

//
// ======================
// CANCEL RIDE
// ======================
//

exports.cancelRide = async (req, res) => {
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
          console.log(
            "Erreur Stripe annulation trajet conducteur =",
            stripeError.message
          );
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

//
// ======================
// UPDATE LOCATION
// ======================
//

exports.updateRideLocation = async (req, res) => {
  console.time("update-ride-location");

  try {
    const { id } = req.params;
    const { token, latitude, longitude } = req.body;

    const user = await User.findOne({ token }).select("_id");

    if (!user) {
      console.timeEnd("update-ride-location");
      return res.status(404).json({
        result: false,
        error: "Utilisateur introuvable",
      });
    }

    const ride = await Ride.findOne({
      _id: id,
      user: user._id,
    });

    if (!ride || ride.status !== "started") {
      console.timeEnd("update-ride-location");
      return res.status(400).json({ result: false });
    }

    ride.currentLatitude = latitude;
    ride.currentLongitude = longitude;
    ride.locationUpdatedAt = new Date();

    await ride.save();

    console.timeEnd("update-ride-location");
    return res.json({ result: true, ride });
  } catch (error) {
    console.error("UPDATE RIDE LOCATION ERROR =", error);
    console.timeEnd("update-ride-location");
    return res.status(500).json({ result: false, error: error.message });
  }
};