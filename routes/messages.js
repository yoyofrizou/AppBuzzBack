const express = require("express");
const router = express.Router();

const Message = require("../models/messages");
const Conversation = require("../models/conversations");
const User = require("../models/users");

router.get("/", async (req, res) => {
  res.json({
    result: true,
    message: "messages route is working",
  });
});

router.get("/unread-count/:token", async (req, res) => {
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversations = await Conversation.find({
      $or: [{ driver: user._id }, { passenger: user._id }],
    });

    const conversationIds = conversations.map((conv) => conv._id);

    const messages = await Message.find({
      conversation: { $in: conversationIds },
      sender: { $ne: user._id },
    });

    let unreadCount = 0;

    messages.forEach((message) => {
      const conversation = conversations.find(
        (conv) => String(conv._id) === String(message.conversation)
      );

      if (!conversation) return;

      const isDriver = String(conversation.driver) === String(user._id);
      const isPassenger = String(conversation.passenger) === String(user._id);

      if (isDriver && !message.readByDriver) {
        unreadCount += 1;
      }

      if (isPassenger && !message.readByPassenger) {
        unreadCount += 1;
      }
    });

    return res.json({
      result: true,
      unreadCount,
    });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

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

    const isDriver = String(conversation.driver) === String(user._id);
    const isPassenger = String(conversation.passenger) === String(user._id);

    if (isDriver) {
      await Message.updateMany(
        {
          conversation: conversation._id,
          sender: { $ne: user._id },
          readByDriver: false,
        },
        {
          $set: { readByDriver: true },
        }
      );
    }

    if (isPassenger) {
      await Message.updateMany(
        {
          conversation: conversation._id,
          sender: { $ne: user._id },
          readByPassenger: false,
        },
        {
          $set: { readByPassenger: true },
        }
      );
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

    return res.json({ result: true, messages: filteredMessages });
  } catch (error) {
    return res.json({ result: false, error: error.message });
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

    const isDriver = String(conversation.driver) === String(user._id);
    const isPassenger = String(conversation.passenger) === String(user._id);

    const newMessage = await Message.create({
      conversation: conversation._id,
      type: "user",
      sender: user._id,
      content: content.trim(),
      visibleTo: "both",
      readByDriver: isDriver,
      readByPassenger: isPassenger,
    });

    conversation.lastMessagePreviewDriver = content.trim();
    conversation.lastMessagePreviewPassenger = content.trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();

    return res.json({ result: true, message: newMessage });
  } catch (error) {
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;
