const express = require("express");
const router = express.Router();   //crée le router des réservations
const Stripe = require("stripe"); //import stripe parce que l’annulation d’un booking peut déclencher une annulation de préautorisation

const Booking = require("../models/bookings");  //importe tous les objets liés à la réservation
const User = require("../models/users");
const Ride = require("../models/rides");
const Conversation = require("../models/conversations");
const Message = require("../models/messages");
const connectDB = require("../config/connectDB");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
});

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


function formatRideDateTimeForMessage(date) {   //formates la date du trajet pour l’utiliser dans les messages de conversation
  if (!date) {
    return { formattedDate: "", formattedTime: "" };
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return { formattedDate: "", formattedTime: "" };
  }

  return {
    formattedDate: d.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    formattedTime: d.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

//
// GET tous les bookings (debug)
//
router.get("/", async (req, res) => {   //Récupére tous les bookings, debug
  try {
    const bookings = await Booking.find()
      .populate("user", "firstname lastname username email")
      .populate("ride");

    res.json({ result: true, bookings });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});


// recupere les bookings de l'utilisateur connecté via son token
router.get("/:token", async (req, res) => { //Ce sont les deux objets standard Express, request (tout ce que le client envoie au serveur) et response C’est ce que le serveur va utiliser pour répondre
  try {             //async car on attend les rep de la BDD
    const user = await User.findOne({ token: req.params.token }); //2eme user c est mon modele mongoose
                            //“cherche un seul document qui correspond à la condition”
                            //entre paranthese c’est l’objet de filtre : je cherche un user dont le champ token est égal à req.params.token
                            //req.params.token = la valeur passée dans l’URL, ex si l'URL est /bookings/abc123 alors req.params.token === "abc123"
                            //donc en gros cette ligne : “Trouve dans la base l’utilisateur qui possède ce token, et mets-le dans user.”
    if (!user) { //Le ! signifie “non” ; Donc !user veut dire : “si user n’existe pas”
      return res.json({ result: false, error: "Utilisateur non trouvé" });  //return : “je renvoie la réponse tout de suite et j’arrête la fonction”
    }                      //result : objet renvoyé au front et on donne la raison

    const bookings = await Booking.find({ user: user._id }) //crée une variable bookings, la liste des réservations de cet utilisateur 
                                   //“cherche toutes les réservations dont le champ user vaut l’id de cet utilisateur”
    .populate("ride")  //Dans un booking, le champ ride contient généralement juste un ObjectId, Avec populate("ride"), Mongoose remplace cet id par le document complet du trajet.                        
      .populate("user", "firstname lastname username email") //remplace le champ user du booking par le document utilisateur, mais seulement avec certains champs
               //le premier argument user c est le champ a populer et ensuite la liste des champs qu'on autorise a renvoyer
      .sort({ createdAt: -1 }); //tri par date de creation decroissante, recent a vieux

    res.json({ result: true, bookings }); //renvoie la réponse au front, objet renvoye entre () et true la requete a reussi
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});


// crée une réservation
router.post("/add", async (req, res) => {  //crées une route HTTP de type POST et add c'est l'URL de la route
  try {
    const { //contenu JSON envoyé par le frontend
      token, //contenu JSON envoyé par le frontend
      ride: rideId,  //“je prends le champ ride du body, mais dans mon code je l’appellerai rideId. body contient ride variable locale devient rideId.
      seatsBooked = 1, //par defaut un pour l'instant, on réserve une place
      message = "", //si aucun message envoye avec alors on met une chaine vide
      paymentIntentId, //identifiant stripe du paiement autorise
      maxAmount, //le montant max
    } = req.body;

    //verif des champs obligatoires
    if (!token || !rideId || !paymentIntentId || !maxAmount) {  //je ne veux pas créer de réservation incomplète
      return res.json({     // || = ou, “Si A est vrai → prends A, tous doivent etre valides 
        result: false,
        error: "Champs manquants",
      });
    }

    const user = await User.findOne({ token }); //“Va dans la collection users et cherche l’utilisateur qui possède ce token.” car on doit transformer un token en un vrau user Mongo avec _id
    if (!user) {
      return res.json({ result: false, error: "Utilisateur non trouvé" });
    }

    const ride = await Ride.findById(rideId).populate( //On cherche le trajet avec cet identifiant.
      "user",                               //Dans ton modèle Ride, le conducteur est stocké dans user. Donc populate("user", ...) remplace l’id du conducteur par son vrai document user, avec seulement certains champs.
                                            //pk? parce qu apres j'ai besoin du conducteur pour verif qu il n est pas le passager lui meme, creer les conversation differentes pour chacun et rediger les messages systeme.
      "firstname lastname prenom nom username profilePhoto car averageRating"
    );
    if (!ride) {
      return res.json({ result: false, error: "Trajet non trouvé" });
    }

    if (String(ride.user?._id) === String(user._id)) { //“Si l’utilisateur qui réserve est aussi le conducteur du trajet, on bloque.” string pour comparer deux objectifId
                                                   //Pourquoi ride.user?._id ? Parce que ride.user a été populé, donc c’est un objet user.
      return res.json({
        result: false,
        error: "Vous ne pouvez pas réserver votre propre trajet",
      });
    }

    if (ride.status !== "open" && ride.status !== "published") {  //Un trajet commencé, terminé ou annulé ne doit plus être réservable
      return res.json({           //“Le trajet doit être soit open, soit published.”
        result: false,
        error: "Le trajet n'est plus réservable",
      });
    }

    const parsedSeatsBooked = Number(seatsBooked) || 1;  //Ça transforme seatsBooked en nombre
                                                  //Et si la conversion échoue ou donne 0 falsy, on met 1.
    if (parsedSeatsBooked <= 0) {   //on refuse 0 ou negatif 
      return res.json({
        result: false,
        error: "Nombre de places invalide",
      });
    }

    if (ride.placesLeft < parsedSeatsBooked) { //“Si le trajet a moins de places restantes que ce qu’on veut réserver, on bloque.”
      return res.json({
        result: false,
        error: "Pas assez de places disponibles",
      });
    }

    const existingBooking = await Booking.findOne({   //vérifie qu’il n’a pas déjà réservé ce trajet
      ride: ride._id,   //on cherche une resa sur ce trajet
      user: user._id,   //par le meme utilisateur 
    });

    if (existingBooking) { //si on trouve on bloque 
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    // empêche un passager d’avoir un autre trajet déjà en cours
    const passengerBookings = await Booking.find({
      user: user._id,
      status: { $in: ["authorized", "captured"] },  // $in ca veut dire doit  etre dans cette liste ; On récupère toutes les réservations actives du passager.
    }).populate({ //on populate ride pour connaître le statut du trajet.
      path: "ride",  //path ca veut dire je veux remplir/populate le champ ride par :
      //ride = juste un ID mais moi je veux acceder a ce qu il y a en dessous cad ride.status, ride.departure, etc donc via populate je dis a mongoose de remplacer cet Id par le doc complet
      select: "_id status departureAddress destinationAddress departureDateTime",
    });

    const currentStartedBooking = passengerBookings.find( //mtn cherche parmi ses bookings actifs : un booking qui a bien un trajet, diff de celui qu il veut reserver et deja started
      (booking) =>
        booking?.ride &&
        String(booking.ride._id) !== String(ride._id) &&
        booking.ride.status === "started"
    );

    if (currentStartedBooking) { //si oui on bloque
      return res.json({
        result: false,
        error: "Vous avez déjà un trajet en cours. Impossible de réserver un autre trajet pour le moment.",
      });
    }

    const newBooking = new Booking({ //cree le booking, construit l'objet reservation
      message,
      status: "authorized",
      ride: ride._id,
      user: user._id,
      seatsBooked: parsedSeatsBooked,
      maxAmount: Number(maxAmount),
      finalAmount: null,   //montant final n’est pas encore connu à ce moment-là
      paymentIntentId,
    });

    const savedBooking = await newBooking.save(); //enregistre vraiment la réservation dans MongoDB

    ride.placesLeft = ride.placesLeft - parsedSeatsBooked;
    await ride.save();     //la resa a un impact immédiat sur la disponibilité du trajet

    const driver = ride.user;  //Comme ride.user a été populé, ça contient le conducteur.

    if (!driver) { //Sécurité supplémentaire.
      return res.json({
        result: false,
        error: "Conducteur du trajet introuvable",
      });
    }

    const passengerFullName = `${user.firstname || ""} ${user.lastname || ""}`.trim(); //${} = template string permet d'inserer du Js dans uns string, ex : `Bonjour ${name}`
               //Ça crée des noms lisibles
    const driverFullName = `${driver.firstname || ""} ${driver.lastname || ""}`.trim();

    let conversation = await Conversation.findOne({ //cherche une conversation existante
      ride: ride._id, //de ce trajet
      driver: driver._id,  //entre ce conducteur
      passenger: user._id, //et ce passager
    });    //si y a on la trouve si y a pas on va la creer

    const { formattedDate, formattedTime } = formatRideDateTimeForMessage( //prends la date brute du trajet et tu la transformes en texte propre pour les messages système
      ride.departureDateTime
    );

    const departureText = ride.departureAddress || "";   //recup repart et arrivee puis evite undefined
    const destinationText = ride.destinationAddress || "";

    const passengerRating =   
      typeof user.passengerAverageRating === "number" //si le passager a une vraie note numerique on l'affiche avec un chiffre apres la virgule
        ? user.passengerAverageRating.toFixed(1) //4.3333 devient "4.3"
        : "N/A"; //sinon on met Not Available

   const driverMessage = //cree le message pour le driver
  `Bonjour, ${user.firstname || "Un passager"} ⭐ ${passengerRating} vient de réserver une place sur votre trajet ${departureText} → ${destinationText}, prévu le ${formattedDate} à ${formattedTime}.` +
  (message ? `\nMessage du passager : "${message}"` : "");

    const passengerMessage = //cree le message pour passager qui vient de reserver
      `Merci d’avoir réservé votre trajet avec ${driverFullName}. Vous pouvez lui écrire via ce chat si besoin.`;

    if (!conversation) { //si y a pas de conversation on la cree 
      conversation = await Conversation.create({
        ride: ride._id,
        driver: driver._id,
        passenger: user._id,
        driverName: driverFullName,
        passengerName: passengerFullName,
        lastMessagePreviewDriver: driverMessage,
        lastMessagePreviewPassenger: passengerMessage,
        lastMessageAt: new Date(),
      });
    } else {   //Ça met simplement à jour l’aperçu du dernier message et la date.
      conversation.lastMessagePreviewDriver = driverMessage;
      conversation.lastMessagePreviewPassenger = passengerMessage;
      conversation.lastMessageAt = new Date();
      await conversation.save();
    }

    await Message.create({
      conversation: conversation._id,
      type: "system",
      sender: null, //ce n’est pas un message utilisateur, c’est un message système
      content: driverMessage,
      visibleTo: "driver_only",
    });

    await Message.create({
      conversation: conversation._id,
      type: "system",
      sender: null,
      content: passengerMessage,
      visibleTo: "passenger_only",
    });

    res.json({    //Le frontend recoit :
      result: true, //succes
      booking: savedBooking, //recup le booking
      conversationId: conversation._id, // la conversation a ouvrir si besoin 
      message: "Réservation créée avec succès", //un message clair
    });
  } catch (err) {
    if (err.code === 11000) { //même si deux requêtes arrivent presque en même temps, on protège encore le système.
      return res.json({
        result: false,
        error: "Vous avez déjà réservé ce trajet",
      });
    }

    res.json({
      result: false,
      error: err.message || "Erreur lors de la réservation",
    });
  }
});


// DELETE supprimer une réservation

router.delete("/delete/:bookingId/:token", async (req, res) => {   //pour que le passager puisse annuler sa resa
  try {     //pas suppression en base mais suppression metier
    const { bookingId, token } = req.params;  //2 paramètres dynamiques donc ex : /bookings/delete/69abc123/monToken123
//“Prends bookingId et token depuis req.params et crée deux variables locales avec ces noms.”
    const user = await User.findOne({ token }); //“Va dans la collection users et cherche le user dont le champ token vaut la valeur du token reçu.”

    if (!user) {
      return res.json({
        result: false,
        error: "Utilisateur non trouvé",
      });
    }

    const booking = await Booking.findById(bookingId);   //retrouve la resa, Va dans la collection bookings et cherche la réservation dont l’id vaut bookingId

    if (!booking) {
      return res.json({
        result: false,
        error: "Réservation non trouvée",
      });
    }

    if (String(booking.user) !== String(user._id)) {   //verif que la resa appartient bien au user
      return res.json({     //compare user stocké dans la réservation et l’utilisateur retrouvé grâce au token
        result: false,
        error: "Vous ne pouvez pas annuler cette réservation",
      });
    }

    if (booking.status === "captured") {   // bloque l'annulation si deja capturer
      return res.json({
        result: false,
        error: "Impossible d'annuler une réservation déjà capturée.",
      });
    }

    if (booking.paymentIntentId && booking.status === "authorized") {  //annule paiement si autorise
      try {     //S’il y a un PaymentIntent Stripe ET que la réservation est seulement autorisée…
        await stripe.paymentIntents.cancel(booking.paymentIntentId); //annule ce paiement
      } catch (err) {}
    }

    const ride = await Ride.findById(booking.ride);  //On récupère le trajet lié à la réservation
    if (ride) { //verif que le trajet existe encore
      ride.placesLeft = ride.placesLeft + booking.seatsBooked; //remettre la place libre
      await ride.save(); //sauvegarde en base
    }

    booking.status = "cancelled";   //on change le statut metier de la resa, passer le trajet a cancelled, ca concerne l'historique plutot que de supprimer
    booking.finalAmount = 0;
    booking.cancelledBy = "passenger";
    booking.cancellationReason = "passenger_cancelled";
    booking.cancelledAt = new Date();
    await booking.save(); //sauvagarde en base

    res.json({ //renvoi au front 
      result: true,
      message: "Réservation annulée avec succès",
    });
  } catch (error) {
    res.json({ result: false, error: error.message });
  }
});

module.exports = router;