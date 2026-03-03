var express = require("express");
var router = express.Router();
const Conversation = require("../models/conversations");     //importe le modèle Conversation


// 🔹 Créer ou récupérer une conversation
router.post("/", async (req, res) => {      //crée une route HTTP de type POST, req = la requête envoyée par le frontend et res = la réponse qu’on va renvoyer
  try {
    const { tripId, driverId, passengerId } = req.body;

    if (!tripId || !driverId || !passengerId) {
      return res.status(400).json({ error: "tripId, driverId et passengerId requis" });
    }

    let conversation = await Conversation.findOne({ tripId, passengerId });

    if (!conversation) {
      conversation = await Conversation.create({
        tripId,
        driverId,
        passengerId,
        messages: [],
      });
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔹 Lire une conversation
router.get("/:id", async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation introuvable" });
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔹 Ajouter un message
router.post("/:id/messages", async (req, res) => {
  try {
    const { senderId, text } = req.body;

    if (!text || !senderId) {
      return res.status(400).json({ error: "senderId et text requis" });
    }

    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation introuvable" });
    }

    const newMessage = {
      senderId,
      text,
      createdAt: new Date(),
    };

    conversation.messages.push(newMessage); // 👈 Sous-document ajouté
    await conversation.save();

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;