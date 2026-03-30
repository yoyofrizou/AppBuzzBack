const express = require("express");
const router = express.Router();

const Conversation = require("../models/conversations");
const User = require("../models/users");
const Ride = require("../models/rides");
const Message = require("../models/messages");

router.get("/", async (req, res) => {
  res.json({
    result: true,
    message: "conversations route is working",
  });
});

router.get("/:token", async (req, res) => {
  console.time("conversations-list");

  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      console.timeEnd("conversations-list");
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversations = await Conversation.find({
      $or: [{ driver: user._id }, { passenger: user._id }],
    })
      .populate("driver", "prenom nom profilePhoto")
      .populate("passenger", "prenom nom profilePhoto")
      .sort({ lastMessageAt: -1 })
      .lean();

    const enrichedConversations = [];

    for (const conversation of conversations) {
      const driverId =
        conversation.driver && conversation.driver._id
          ? String(conversation.driver._id)
          : String(conversation.driver);

      const passengerId =
        conversation.passenger && conversation.passenger._id
          ? String(conversation.passenger._id)
          : String(conversation.passenger);

      const isDriver = driverId === String(user._id);
      const isPassenger = passengerId === String(user._id);

      const unreadQuery = {
        conversation: conversation._id,
        sender: { $ne: user._id },
        $or: [{ visibleTo: "both" }],
      };

      if (isDriver) {
        unreadQuery.$or.push({ visibleTo: "driver_only" });
        unreadQuery.readByDriver = false;
      }

      if (isPassenger) {
        unreadQuery.$or.push({ visibleTo: "passenger_only" });
        unreadQuery.readByPassenger = false;
      }

      const unreadCount = await Message.countDocuments(unreadQuery);

      enrichedConversations.push({
        ...conversation,
        unreadCount,
      });
    }

    console.log(
      "UNREAD COUNTS =",
      enrichedConversations.map((conv) => ({
        id: conv._id,
        unreadCount: conv.unreadCount,
      }))
    );

    console.timeEnd("conversations-list");

    return res.json({
      result: true,
      conversations: enrichedConversations,
    });
  } catch (error) {
    console.error("GET /conversations/:token ERROR =", error);
    console.timeEnd("conversations-list");
    return res.status(500).json({
      result: false,
      error: error.message,
    });
  }
});

router.post("/open-or-create", async (req, res) => {
  try {
    const { token, rideId, otherUserId } = req.body;

    if (!token || !rideId || !otherUserId) {
      return res.json({ result: false, error: "Champs manquants" });
    }

    const currentUser = await User.findOne({ token });
    if (!currentUser) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const ride = await Ride.findById(rideId).populate(
      "user",
      "prenom nom profilePhoto"
    );

    if (!ride) {
      return res.json({ result: false, error: "Trajet introuvable" });
    }

    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.json({ result: false, error: "Autre utilisateur introuvable" });
    }

    const driverId = String(ride.user?._id);
    const currentUserId = String(currentUser._id);
    const otherId = String(otherUser._id);

    let driver;
    let passenger;

    if (currentUserId === driverId) {
      driver = currentUser;
      passenger = otherUser;
    } else if (otherId === driverId) {
      driver = otherUser;
      passenger = currentUser;
    } else {
      return res.json({
        result: false,
        error: "Impossible de déterminer conducteur et passager",
      });
    }

    let conversation = await Conversation.findOne({
      ride: ride._id,
      driver: driver._id,
      passenger: passenger._id,
    });

    if (!conversation) {
      const driverFullName = `${driver.prenom || ""} ${driver.nom || ""}`.trim();
      const passengerFullName = `${passenger.prenom || ""} ${passenger.nom || ""}`.trim();

      conversation = await Conversation.create({
        ride: ride._id,
        driver: driver._id,
        passenger: passenger._id,
        driverName: driverFullName,
        passengerName: passengerFullName,
        lastMessagePreviewDriver: "",
        lastMessagePreviewPassenger: "",
        lastMessageAt: new Date(),
      });
    }

    conversation = await Conversation.findById(conversation._id)
      .populate("driver", "prenom nom profilePhoto")
      .populate("passenger", "prenom nom profilePhoto");

    return res.json({
      result: true,
      conversation,
    });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;
