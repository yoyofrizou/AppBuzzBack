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
  console.time("messages-unread-count");

  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      console.timeEnd("messages-unread-count");
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversations = await Conversation.find({
      $or: [{ driver: user._id }, { passenger: user._id }],
    }).select("_id driver passenger");

    let unreadCount = 0;

    for (const conversation of conversations) {
      const isDriver = String(conversation.driver) === String(user._id);
      const isPassenger = String(conversation.passenger) === String(user._id);

      const unreadMessage = await Message.findOne({
        conversation: conversation._id,
        sender: { $ne: user._id },
        ...(isDriver ? { readByDriver: false } : {}),
        ...(isPassenger ? { readByPassenger: false } : {}),
        $or: [
          { visibleTo: "both" },
          ...(isDriver ? [{ visibleTo: "driver_only" }] : []),
          ...(isPassenger ? [{ visibleTo: "passenger_only" }] : []),
        ],
      }).select("_id");

      if (unreadMessage) {
        unreadCount += 1;
      }
    }

    console.log("UNREAD COUNT =", unreadCount);
    console.timeEnd("messages-unread-count");

    return res.json({
      result: true,
      unreadCount,
    });
  } catch (error) {
    console.error("GET /messages/unread-count ERROR =", error);
    console.timeEnd("messages-unread-count");
    return res.json({ result: false, error: error.message });
  }
});

router.get("/:conversationId/:token", async (req, res) => {
  console.time("messages-get-conversation");

  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) {
      console.timeEnd("messages-get-conversation");
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      console.timeEnd("messages-get-conversation");
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
          $or: [{ visibleTo: "both" }, { visibleTo: "driver_only" }],
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
          $or: [{ visibleTo: "both" }, { visibleTo: "passenger_only" }],
        },
        {
          $set: { readByPassenger: true },
        }
      );
    }
if (isPassenger) {
  await Message.updateMany(
    {
      conversation: conversation._id,
      sender: { $ne: user._id },
      readByPassenger: false,
      $or: [{ visibleTo: "both" }, { visibleTo: "passenger_only" }],
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

    console.log("MESSAGES COUNT =", filteredMessages.length);
    console.timeEnd("messages-get-conversation");

    return res.json({ result: true, messages: filteredMessages });
  } catch (error) {
    console.error("GET /messages/:conversationId/:token ERROR =", error);
    console.timeEnd("messages-get-conversation");
    return res.json({ result: false, error: error.message });
  }
});

router.post("/add", async (req, res) => {
  console.time("messages-add");

  try {
    const { token, conversationId, content } = req.body;

    if (!token || !conversationId || !content || !content.trim()) {
      console.timeEnd("messages-add");
      return res.json({ result: false, error: "Champs manquants" });
    }

    const user = await User.findOne({ token });
    if (!user) {
      console.timeEnd("messages-add");
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.timeEnd("messages-add");
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

    console.timeEnd("messages-add");

    return res.json({ result: true, message: newMessage });
  } catch (error) {
    console.error("POST /messages/add ERROR =", error);
    console.timeEnd("messages-add");
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;