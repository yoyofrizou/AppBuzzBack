const express = require("express");
const router = express.Router();

const Conversation = require("../models/conversations");
const User = require("../models/users");
const Ride = require("../models/rides");
const Message = require("../models/messages");
const connectDB = require("../config/connectDB");

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

router.get("/", async (req, res) => {    //route test
  res.json({
    result: true,
    message: "conversations route is working",
  });
});

router.get("/:token", async (req, res) => {   //récup toutes les conversations de l’utilisateur connecté
  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversations = await Conversation.find({
      $or: [{ driver: user._id }, { passenger: user._id }],   //cherche les conversations où l’utilisateur est soit conducteur soit passager
    })
      .populate("driver", "prenom nom profilePhoto")    //infos visibles des deux participants
      .populate("passenger", "prenom nom profilePhoto")
      .sort({ lastMessageAt: -1 })   //classes par dernière activité
      .lean();   //récupères des objets JS simples au lieu de documents Mongoose lourds

    const enrichedConversations = await Promise.all(    
      conversations.map(async (conversation) => {     //veux savoir si l’utilisateur a des messages non lus
        
        const isDriver =   //Déterminer le rôle de l’utilisateur, parce que la règle de lecture dépend de son rôle
          String(conversation.driver?._id || conversation.driver) ===   //si c’est le conducteur → regarder readByDriver
          String(user._id);

        const isPassenger =  //Déterminer le rôle de l’utilisateur
          String(conversation.passenger?._id || conversation.passenger) ===  //si c’est le passager → regarder readByPassenger
          String(user._id);

    const unreadCount = await Message.countDocuments({
  conversation: conversation._id,
  sender: { $ne: user._id },
  ...(isDriver ? { readByDriver: false } : {}),
  ...(isPassenger ? { readByPassenger: false } : {}),
  $or: [
    { visibleTo: "both" },
    ...(isDriver ? [{ visibleTo: "driver_only" }] : []),
    ...(isPassenger ? [{ visibleTo: "passenger_only" }] : []),
  ],
});

return {
  ...conversation,
  hasUnread: unreadCount > 0,
  unreadCount,
};
      })
    );

    return res.json({   //renvoie la liste enrichie des conversations
      result: true,
      conversations: enrichedConversations,
    });
  } catch (error) {
    console.error("GET /conversations/:token ERROR =", error);
    return res.status(500).json({ result: false, error: error.message });
  }
});

router.post("/open-or-create", async (req, res) => {   //ouvrir une conversation si elle existe déjà sinon la creer 
  try {
    const { token, rideId, otherUserId } = req.body;

    if (!token || !rideId || !otherUserId) {   //besoin de l utilisateur courant, du trajet et de l'autre utilisateur
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

    //déterminer qui est conducteur / passager : je ne fais pas confiance à une déclaration arbitraire des rôles donc je les déduis du trajet
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

    let conversation = await Conversation.findOne({   //chercher une conversation existante
      ride: ride._id,
      driver: driver._id,
      passenger: passenger._id,
    });

    if (!conversation) {   //créer si besoin, avec une structure propre dès le départ, même avant qu’il y ait un vrai message
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

    conversation = await Conversation.findById(conversation._id) //recharger avec populate Pour renvoyer au frontend une conversation directement exploitable
      .populate("driver", "prenom nom profilePhoto")
      .populate("passenger", "prenom nom profilePhoto");

    return res.json({  //reponse finale
      result: true,
      conversation,
    });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;
