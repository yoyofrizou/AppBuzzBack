const express = require("express");
const router = express.Router();

const Message = require("../models/messages");
const Conversation = require("../models/conversations");
const User = require("../models/users");

router.get("/:conversationId/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.json({ result: false, error: "Conversation introuvable" });
    }

    const allMessages = await Message.find({
      conversation: conversation._id,
    }).sort({ createdAt: 1 });

    const filteredMessages = allMessages.filter((message) => {
      if (message.visibleTo === "both") return true;

      if (
        message.visibleTo === "driver_only" &&
        String(conversation.driver) === String(user._id)
      ) {
        return true;
      }

      if (
        message.visibleTo === "passenger_only" &&
        String(conversation.passenger) === String(user._id)
      ) {
        return true;
      }

      return false;
    });

    res.json({ result: true, messages: filteredMessages });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

router.post("/add", async (req, res) => {
  try {
    const { token, conversationId, content } = req.body;

    if (!token || !conversationId || !content || !content.trim()) {
      return res.json({ result: false, error: "Champs manquants" });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.json({ result: false, error: "Conversation introuvable" });
    }

    const newMessage = await Message.create({
      conversation: conversation._id,
      type: "user",
      sender: user._id,
      content: content.trim(),
      visibleTo: "both",
    });

    conversation.lastMessagePreviewDriver = content.trim();
    conversation.lastMessagePreviewPassenger = content.trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.json({ result: true, message: newMessage });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;