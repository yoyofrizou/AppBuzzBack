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
// 💰 CAPTURE PAIEMENTS
// ======================
//

async function captureRidePaymentsForPresentPassengers(rideId) {
  const ride = await Ride.findById(rideId);

  if (!ride) throw new Error("Trajet introuvable");

  const bookings = await Booking.find({
    ride: ride._id,
    status: "authorized",
  });

  // ❌ absents → annulation
  const absentBookings = bookings.filter(
    (b) => b.passengerPresenceStatus === "absent"
  );

  for (const booking of absentBookings) {
    if (booking.paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(booking.paymentIntentId);
      } catch (err) {
        console.log("Erreur cancel:", err.message);
      }
    }

    booking.status = "cancelled";
    booking.finalAmount = 0;
    await booking.save();
  }

  // ✅ présents
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

  const finalPricePerSeat = Math.floor(
    ride.totalCost / (totalPassengers + 1)
  );

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
// HELPERS
// ======================
//

function getTripCategoryFromRide(ride) {
  if (!ride) return "upcoming";

  if (["open", "published"].includes(ride.status)) return "upcoming";
  if (ride.status === "started") return "current";
  if (ride.status === "completed") return "past";
  if (ride.status === "cancelled") return "cancelled";

  return "upcoming";
}

function getPassengerTripCategory(booking) {
  const ride = booking?.ride;

  if (!ride) return "upcoming";
  if (ride.status === "completed") return "past";

  if (["scanned", "manual"].includes(booking.passengerPresenceStatus)) {
    return "current";
  }

  return "upcoming";
}

function canDriverStartRide(passengers = []) {
  if (!passengers.length) return false;

  return passengers.every((b) =>
    ["scanned", "manual", "absent"].includes(
      b.passengerPresenceStatus
    )
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
  const ride = rideDoc?.toObject ? rideDoc.toObject() : rideDoc;

  return {
    ...ride,
    driver: normalizeUser(ride.user, true),
    tripCategory: getTripCategoryFromRide(ride),
  };
}

//
// ======================
// CREATE RIDE
// ======================
//

exports.createRide = async (req, res) => {
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
      return res.json({ result: false, error: "Champs manquants." });
    }

    const user = await User.findOne({ token });
    if (!user) return res.json({ result: false, error: "User introuvable" });

    const seats = Math.max(Number(availableSeats) || 1, 1);
    const priceValue = Math.max(Number(price) || 0, 0);

    const newRide = new Ride({
      user: user._id,
      departureAddress,
      destinationAddress,
      departureLatitude,
      departureLongitude,
      destinationLatitude,
      destinationLongitude,
      departureDateTime: new Date(departureDateTime),
      pickupWalkMinutes: Number(pickupWalkMinutes) || 0,
      dropoffWalkMinutes: Number(dropoffWalkMinutes) || 0,
      price: priceValue,
      placesTotal: seats,
      placesLeft: seats,
      totalCost: Math.round(priceValue * 100),
      status: "published",
    });

    const savedRide = await newRide.save();

    const populated = await Ride.findById(savedRide._id).populate("user");

    res.json({
      result: true,
      ride: enrichRideForFrontend(populated),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: error.message });
  }
};

//
// ======================
// DRIVER TRIPS
// ======================
//

exports.getDriverTrips = async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });
    if (!user) return res.json({ result: false });

    const rides = await Ride.find({ user: user._id })
      .populate("user")
      .sort({ departureDateTime: -1 });

    const enriched = [];

    for (const rideDoc of rides) {
      const bookings = await Booking.find({
        ride: rideDoc._id,
        status: { $in: ["authorized", "captured"] },
      }).populate("user");

      const passengers = bookings.map((b) => ({
        ...b.toObject(),
        passenger: normalizeUser(b.user),
      }));

      const ride = enrichRideForFrontend(rideDoc);

      enriched.push({
        ...ride,
        passengers,
        canStartRide: canDriverStartRide(passengers),
      });
    }

    res.json({ result: true, rides: enriched });
  } catch (error) {
    res.status(500).json({ result: false, error: "Erreur serveur" });
  }
};

//
// ======================
// BOOKINGS PASSAGER
// ======================
//

exports.getPassengerBookings = async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable" });
    }

    const bookings = await Booking.find({
      user: user._id,
      status: { $in: ["authorized", "captured"] },
    })
      .populate({
        path: "ride",
        populate: {
          path: "user",
          select: "prenom nom profilePhoto car",
        },
      })
      .lean();

    const result = bookings
      .filter((b) => b.ride)
      .map((b) => {
        const ride = enrichRideForFrontend(b.ride);

        return {
          ...b,
          ride,
          tripCategory: getPassengerTripCategory({
            ...b,
            ride,
          }),
        };
      });

    return res.json({ result: true, bookings: result });
  } catch (error) {
    console.error("GET /rides/passenger-bookings ERROR =", error);
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

  if (!booking) throw new Error("Booking introuvable");

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
    res.json({ result: true, booking });
  } catch (e) {
    res.status(500).json({ result: false, error: e.message });
  }
};

exports.validatePassengerManually = async (req, res) => {
  try {
    const booking = await updatePresence(req.params.bookingId, "manual");
    res.json({ result: true, booking });
  } catch (e) {
    res.status(500).json({ result: false });
  }
};

exports.markPassengerAbsent = async (req, res) => {
  try {
    const booking = await updatePresence(req.params.bookingId, "absent");
    res.json({ result: true, booking });
  } catch (e) {
    res.status(500).json({ result: false });
  }
};

//
// ======================
// START RIDE
// ======================
//

exports.startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.json({ result: false });

    const bookings = await Booking.find({
      ride: ride._id,
      status: { $in: ["authorized", "captured"] },
    });

    const ready =
      bookings.length > 0 &&
      bookings.every((b) =>
        ["scanned", "manual", "absent"].includes(
          b.passengerPresenceStatus
        )
      );

    if (!ready) {
      return res.json({
        result: false,
        error: "Tous les passagers doivent être validés",
      });
    }

    const paymentSummary =
      await captureRidePaymentsForPresentPassengers(ride._id);

    ride.status = "started";
    await ride.save();

    res.json({
      result: true,
      ride,
      paymentSummary,
    });
  } catch (e) {
    res.status(500).json({ result: false, error: e.message });
  }
};

//
// ======================
// UPDATE LOCATION
// ======================
//

exports.updateRideLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { token, latitude, longitude } = req.body;

    const user = await User.findOne({ token });

    const ride = await Ride.findOne({
      _id: id,
      user: user._id,
    });

    if (!ride || ride.status !== "started") {
      return res.status(400).json({ result: false });
    }

    ride.currentLatitude = latitude;
    ride.currentLongitude = longitude;
    ride.locationUpdatedAt = new Date();

    await ride.save();

    res.json({ result: true, ride });
  } catch {
    res.status(500).json({ result: false });
  }
};