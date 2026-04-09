const express = require("express");
const router = express.Router();

const Message = require("../models/messages");
const Conversation = require("../models/conversations");
const User = require("../models/users");
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

router.get("/", async (req, res) => {
  res.json({
    result: true,
    message: "messages route is working",
  });
});

router.get("/unread-count/:token", async (req, res) => {   //Renvoyer le nombre de conversations contenant au moins un message non lu pour cet utilisateur
                //compteur de conversations ayant du non lu

  try {
    const user = await User.findOne({ token: req.params.token }).select("_id");

    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversations = await Conversation.find({   //seulement les conversations qui le concernent
      $or: [{ driver: user._id }, { passenger: user._id }],
    }).select("_id driver passenger");

    let unreadCount = 0;   //compte combien de conversations ont au moins un non-lu

    for (const conversation of conversations) {
      const isDriver = String(conversation.driver) === String(user._id);  //la règle de lecture dépend du rôle
      const isPassenger = String(conversation.passenger) === String(user._id);

      const unreadMessage = await Message.findOne({   // je cherches un message :
        conversation: conversation._id,   //dans cette conversation
        sender: { $ne: user._id },  //envoyé par quelqu’un d’autre
        ...(isDriver ? { readByDriver: false } : {}),  //pas encore lu par cet utilisateur
        ...(isPassenger ? { readByPassenger: false } : {}),
        $or: [
          { visibleTo: "both" },
          ...(isDriver ? [{ visibleTo: "driver_only" }] : []),   //et visible pour cet utilisateur
          ...(isPassenger ? [{ visibleTo: "passenger_only" }] : []),
        ],
      }).select("_id");

      if (unreadMessage) {
        unreadCount += 1;   //S’il existe au moins un message non lu, tu ajoutes 1
      }
    }

    return res.json({
      result: true,
      unreadCount,
    });
  } catch (error) {

    return res.json({ result: false, error: error.message });
  }
});

router.get("/:conversationId/:token", async (req, res) => {  //Elle fait 2 choses en une seule requête : Elle fait 2 choses en une seule requête et elle marque comme lus les messages que l’utilisateur vient de consulter
  try {
    const user = await User.findOne({ token: req.params.token });

    if (!user) { //Si le token est faux ou expiré, on arrête tout.
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const conversation = await Conversation.findById(req.params.conversationId); //On récupère la conversation demandée.

    if (!conversation) { //Si l’ID de conversation n’existe pas, on renvoie une erreur.
      return res.json({ result: false, error: "Conversation introuvable" });
    }

    //On détermine le rôle de l’utilisateur dans cette conversation
    const isDriver = String(conversation.driver) === String(user._id);  //on convertit en string car parfois c est un objectId, un objet popule...
    const isPassenger = String(conversation.passenger) === String(user._id);

    if (isDriver) { //On entre ici si l’utilisateur connecté est le conducteur de cette conversation
      const result = await Message.updateMany( //“Mets à jour tous les messages qui correspondent à ces règles.”
        { //“Je veux tous les messages :
          conversation: conversation._id, //de cette conversation
          sender: { $ne: user._id }, //envoyes par qq un d'autre
          readByDriver: false, //pas encore lus par le conducteur
          $or: [{ visibleTo: "both" }, { visibleTo: "driver_only" }], //et visibles par le conducteur
        },
        {
          $set: { readByDriver: true }, //“Pour tous ces messages, je passe readByDriver à true.”
        }
      );
    }

    if (isPassenger) { //si l utilisateur est passager
      const result = await Message.updateMany(
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

    const allMessages = await Message.find({ //On récupère tous les messages de la conversation, triés du plus ancien au plus récent.
      conversation: conversation._id,
    }).sort({ createdAt: 1 });

    const filteredMessages = allMessages.filter((message) => { //On ne veut pas forcément montrer tous les messages, certains sont pour tous d'autres juste pour le passager etc...
      if (message.visibleTo === "both") return true; 

      if (
        message.visibleTo === "driver_only" &&
        String(conversation.driver) === String(user._id)
      ) {
        return true; //Si le message est visible seulement conducteur, on le garde uniquement si l’utilisateur courant est bien ce conducteur.
      }

      if (
        message.visibleTo === "passenger_only" &&
        String(conversation.passenger) === String(user._id)
      ) {
        return true;
      }

      return false; //Sinon, on cache le message.
      //le front ne reçoit que les messages que l’utilisateur a le droit de voir
    });

    return res.json({ result: true, messages: filteredMessages }); //la liste propre des messages visibles
  } catch (error) {
    console.error("GET /messages/:conversationId/:token ERROR =", error);
    return res.json({ result: false, error: error.message });
  }
});

router.post("/add", async (req, res) => {   //Ajouter un nouveau message utilisateur dans une conversation

  try {
    const { token, conversationId, content } = req.body;   //récupérer les champs

    if (!token || !conversationId || !content || !content.trim()) {   //valider les champs
  
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

    const newMessage = await Message.create({   //creer le message
      conversation: conversation._id,
      type: "user",
      sender: user._id,
      content: content.trim(),
      visibleTo: "both",
      readByDriver: isDriver,   //message automatiquement lu par son propre auteur
      readByPassenger: isPassenger,
    });

    conversation.lastMessagePreviewDriver = content.trim();  //mets à jour : l’aperçu du dernier message et la date de derniere activite
    conversation.lastMessagePreviewPassenger = content.trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();

  

    return res.json({ result: true, message: newMessage });
  } catch (error) {
    console.error("POST /messages/add ERROR =", error);
    return res.json({ result: false, error: error.message });
  }
});

module.exports = router;