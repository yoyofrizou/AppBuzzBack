var express = require("express");
var router = express.Router();   //crées un router dédié aux utilisateurs

const User = require("../models/users");
const { checkBody } = require("../modules/checkBody"); //Dans beaucoup de routes, je fais : if (!req.body.email || !req.body.password) {return res.json({ result: false, error: "Champs manquants" }); } et je vais repeter ca partout 
      //donc je vais plutot que de repeter importer une fonction checkBody que j ai créée
      //robot 🤖 qui vérifie : “est-ce que tous les champs sont remplis ?"
const uid2 = require("uid2");    //generer un token utilisateur
const bcrypt = require("bcrypt");   //hasher les MDP
const uniqid = require("uniqid");   //genere les noms temporaires de fichiers
const cloudinary = require("cloudinary").v2;   //uploader images
const fs = require("fs");  //supp fichiers temporaires

const nodemailer = require("nodemailer");   //envoyer des emails
const crypto = require("crypto");   //genere des tokens de reset

const connectDB = require("../config/connectDB");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});  //configures l’envoi d’emails

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});  //connecte mon backend à Cloudinary pour les photos de profil et les documents conducteur

router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({
      result: false,
      error: "Connexion base de données impossible.",
    });
  }
});

router.get("/", async (req, res) => {   //Route pour récupérer tous les utilisateurs pour debug
  try {
    const users = await User.find();
    res.json({ result: true, users });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

router.post("/test-create", async (req, res) => {   //Route de test pour créer un utilisateur fictif pour debug
  try {
    const hash = bcrypt.hashSync("123456", 10);

    const newUser = new User({
      prenom: req.body.prenom,
      nom: req.body.nom,
      email: req.body.email,
      telephone: req.body.telephone,
      password: hash,
      token: uid2(32),
      profilePhoto: "https://via.placeholder.com/150",
      stripeCustomerId: null,
      defaultPaymentMethodId: null,
      car: null,
      photos: [],
      driverProfile: {
        driverLicenseUrl: null,
        identityDocumentUrl: null,
        insuranceDocumentUrl: null,
        isProfileComplete: false,
        isVerified: false,
      },
    });

    const savedUser = await newUser.save();

    res.json({ result: true, user: savedUser });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

router.post("/register", async (req, res) => { //créer un nouvel utilisateur, vérifier ses infos, uploader sa photo de profil, enregistrer l’utilisateur en base, puis renvoyer ses infos + son token.
  //donc pas qu une creation , gere les validations, le hash du MDP, l'upload cloudinary, l'initialisation du profil
  const photoPath = `/tmp/${uniqid()}.jpg`;   //prépares un chemin temporaire unique pour stocker la photo reçue
        //je dois d’abord recevoir le fichier par le front localement, le stocker temporairement avant de l’envoyer à Cloudinary puis le supprimer
  // /tmp/ dossier temporaire et uniqid() génère un identifiant unique
        try {

    if (
      !checkBody(req.body, [  // checkbody fonction utilitaire qui vérifie que les champs demandés existent et ne sont pas vides, l objet a verif c est le req.body
       // ! ca veut dire si la verif echoue
        "prenom",
        "nom",
        "email",
        "telephone",
        "password",
        "confirmPassword",
      ])
    ) {
      return res.json({ result: false, error: "Champs manquants." });
    }

    if (req.body.password !== req.body.confirmPassword) { //vérifies la confirmation de mot de passe
      return res.json({
        result: false,
        error: "Les mots de passe ne correspondent pas.",
      });
    }

    if (!req.files || !req.files.profilePhoto) {   //req.files c est la ou les fichiers sont uploades grace a express-fileupload, rends la photo obligatoire
      return res.json({ result: false, error: "Photo de profil obligatoire." });
    //Si aucun fichier n’a été envoyé, ou si profilePhoto n’existe pas, on bloque
    }

    const existingUser = await User.findOne({
      $or: [ //au moins une des conditions suivantes
        { email: req.body.email.trim().toLowerCase() },
        { telephone: req.body.telephone.trim() },
      ],    //cherches un doublon par email ou téléphone et bloque au cas ou
    });

    if (existingUser) {
      return res.json({ result: false, error: "Utilisateur déjà existant." });
    }

    const hash = bcrypt.hashSync(req.body.password, 10); //hashe le mot de passe
    //bcrypt = librairie pour hasher les MDP, donc transforme le brut en version securisee

    await req.files.profilePhoto.mv(photoPath); //fichier recu et mv = Déplace / enregistre le fichier sur le serveur à l’endroit photoPath car cloudinary a besoin d un fichier ou chemin a upload
    const resultCloudinary = await cloudinary.uploader.upload(photoPath); //result : Cloudinary renvoie un objet avec plein d’infos, par exemple : URL, secure_URL, public+id et dimensions et je m en sers ensuite pour prendre resultCloudinary.secure_url
    //Upload de l’image
    fs.unlinkSync(photoPath); //fs : Le module file system de Node et unlinkSync : Supprime le fichier local car c est bon une fois que c est sur cloudinary
   //flow image : je reçois le fichier, l enregistre temporairement, l'envoie sur cloudinary et la supp du fichier local 

    const newUser = new User({ //nouveau docu user et je nettoie les champs du body, pas d'espace etc
      prenom: req.body.prenom.trim(),
      nom: req.body.nom.trim(),
      email: req.body.email.trim().toLowerCase(),
      telephone: req.body.telephone.trim(),
      password: hash,
      token: uid2(32),    //génères un token utilisateur pour identifier le user dans les futurs appels
      profilePhoto: resultCloudinary.secure_url,  //stockes l’URL HTTPS Cloudinary finale de l’image
      stripeCustomerId: null,
      defaultPaymentMethodId: null,
      car: null,
      photos: [],
      driverProfile: {    //initialise le profil conducteur vide pour plus tard 
      driverLicenseUrl: null,
      identityDocumentUrl: null,
      insuranceDocumentUrl: null,
      isProfileComplete: false,
      isVerified: false,
     },
       });

    const savedUser = await newUser.save();
   

    return res.json({
      result: true,
      token: savedUser.token,
      user: {
        _id: savedUser._id,
        prenom: savedUser.prenom,
        nom: savedUser.nom,
        email: savedUser.email,
        telephone: savedUser.telephone,
        profilePhoto: savedUser.profilePhoto,
        stripeCustomerId: savedUser.stripeCustomerId,
        defaultPaymentMethodId: savedUser.defaultPaymentMethodId,
      },
    });    //renvoi le token et les infos utiles du user pour que le front puisse connecter immediatement l'utilisateur apres connection
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({
      result: false,
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    if (!checkBody(req.body, ["email", "password"])) {   //verifie les champs
      res.json({ result: false, error: "Missing or empty fields" });
      return;
    }

    const data = await User.findOne({   //cherche l’utilisateur par email normalisé
      //si trouvé → data = user sinon → data = null
      email: req.body.email.trim().toLowerCase(),
    });

    if (data && bcrypt.compareSync(req.body.password, data.password)) {  //compare le mot de passe saisi avec le hash enregistré
      //bcrypt.compareSync = compare mot de passe entré (plaintext) et mot de passe en base (hash)
      res.json({     //renvoie les infos nécessaires au frontend
        result: true,
        token: data.token,
        user: {
          _id: data._id,
          prenom: data.prenom,
          nom: data.nom,
          email: data.email,
          telephone: data.telephone,
          profilePhoto: data.profilePhoto,
          car: data.car,
          driverProfile: data.driverProfile,
          photos: data.photos,
          stripeCustomerId: data.stripeCustomerId,
          defaultPaymentMethodId: data.defaultPaymentMethodId,
        },
      });
    } else {
      res.json({ result: false, error: "User not found or wrong password" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

router.delete("/delete/:token", async (req, res) => {  //Supprime le compte via le token
  try {
    const data = await User.deleteOne({ token: req.params.token });

    if (data.deletedCount > 0) {
      res.json({ result: true, message: "Compte supprimé avec succès" });
    } else {
      res.json({ result: false, error: "Utilisateur non trouvé" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});
 
router.post("/addCar", async (req, res) => {    //Ajoute ou remplace la voiture du user
  try {
    if (
      !checkBody(req.body, [
        "token",
        "brand",
        "model",
        "color",
        "nbSeats",
        "licencePlate",
      ])
    ) {
      res.json({ result: false, error: "Champs manquants" });
      return;
    }

    const data = await User.findOne({ token: req.body.token });

    if (!data) {
      res.json({ result: false, error: "Utilisateur non trouvé" });
      return;
    }

    data.car = {
      brand: req.body.brand,
      model: req.body.model,
      color: req.body.color,
      nbSeats: req.body.nbSeats,
      licencePlate: req.body.licencePlate,
    };

    const updatedUser = await data.save();

    res.json({ result: true, car: updatedUser.car });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

router.put("/updateProfilePhoto", async (req, res) => {    //separation : inscription avec photo puis mise a jour independante
  const photoPath = `/tmp/${uniqid()}.jpg`;

  try {
    if (!req.files || !req.files.profilePhoto) {
      res.json({ result: false, error: "Photo manquante." });
      return;
    }

    if (!req.body.token) {
      res.json({ result: false, error: "Token manquant." });
      return;
    }

    await req.files.profilePhoto.mv(photoPath);
    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
    fs.unlinkSync(photoPath);

    const user = await User.findOne({ token: req.body.token });

    if (!user) {
      res.json({ result: false, error: "Utilisateur introuvable." });
      return;
    }

    user.profilePhoto = resultCloudinary.secure_url;
    await user.save();

    res.json({
      result: true,
      message: "Photo de profil mise à jour.",
      profilePhoto: resultCloudinary.secure_url,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

router.post("/uploadDriverDocument", async (req, res) => {
  const photoPath = `/tmp/${uniqid()}.jpg`;

  try {
    if (!req.body.token) {   //validation du token
      return res.json({ result: false, error: "Token manquant." });
    }

    if (!req.body.documentType) {    //validation du type de document
      return res.json({ result: false, error: "Type de document manquant." });
    }

    if (!req.files || !req.files.document) {   //validation du fichier
      return res.json({ result: false, error: "Document manquant." });
    }

    const { documentType } = req.body;

    const allowedTypes = [
      "driverLicense",
      "identityDocument",
      "insuranceDocument",
    ];

    if (!allowedTypes.includes(documentType)) {
      return res.json({ result: false, error: "Type de document invalide." });
    }

    await req.files.document.mv(photoPath);   //upload Cloudinary
    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
    fs.unlinkSync(photoPath);

    const user = await User.findOne({ token: req.body.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable." });
    }

    if (!user.driverProfile) {   //mise à jour du bon champ
      user.driverProfile = {};
    }

    if (documentType === "driverLicense") {
      user.driverProfile.driverLicenseUrl = resultCloudinary.secure_url;
    }

    if (documentType === "identityDocument") {
      user.driverProfile.identityDocumentUrl = resultCloudinary.secure_url;
    }

    if (documentType === "insuranceDocument") {
      user.driverProfile.insuranceDocumentUrl = resultCloudinary.secure_url;
    }

    const isProfileComplete =   //recalcul de isProfileComplete
      user.car &&
      user.car.brand &&
      user.car.color &&
      user.car.model &&
      user.car.nbSeats > 0 &&
      user.car.licencePlate &&
      user.driverProfile.driverLicenseUrl &&
      user.driverProfile.identityDocumentUrl &&
      user.driverProfile.insuranceDocumentUrl;

    user.driverProfile.isProfileComplete = Boolean(isProfileComplete);
    //Après chaque ajout de document, je recalculais automatiquement si le profil conducteur pouvait être considéré comme complet

    await user.save();

    return res.json({
      result: true,
      message: "Document envoyé avec succès.",
      url: resultCloudinary.secure_url,
      driverProfile: user.driverProfile,
    });
  } catch (error) {
    console.error("POST /users/uploadDriverDocument error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

router.put("/updateDriverProfile", async (req, res) => {  //mise à jour groupée du profil conducteur : infos voiture, URL des docs et l'etat IsProfilcompleted
  try {
    const {
      token,
      brand,
      color,
      model,
      nbSeats,
      licencePlate,
      driverLicenseUrl,
      identityDocumentUrl,
      insuranceDocumentUrl,
    } = req.body;

    if (!token) {
      return res.json({ result: false, error: "Token manquant." });
    }

    const user = await User.findOne({ token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable." });
    }

    user.car = {
      brand: brand?.trim() || "",
      color: color?.trim() || "",
      model: model?.trim() || "",
      nbSeats: Number(nbSeats) || 0,
      licencePlate: licencePlate?.trim() || "",
    };

    user.driverProfile.driverLicenseUrl = driverLicenseUrl?.trim() || null;
    user.driverProfile.identityDocumentUrl = identityDocumentUrl?.trim() || null;
    user.driverProfile.insuranceDocumentUrl = insuranceDocumentUrl?.trim() || null;

    const isProfileComplete =
      user.car &&
      user.car.brand &&
      user.car.color &&
      user.car.model &&
      user.car.nbSeats > 0 &&
      user.car.licencePlate &&
      user.driverProfile.driverLicenseUrl &&
      user.driverProfile.identityDocumentUrl &&
      user.driverProfile.insuranceDocumentUrl;

    user.driverProfile.isProfileComplete = Boolean(isProfileComplete);

    await user.save();

    res.json({
      result: true,
      message: "Profil conducteur mis à jour.",
      car: user.car,
      driverProfile: user.driverProfile,
      user: {
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (error) {
    console.error("PUT /users/updateDriverProfile error:", error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

  
router.post("/forgot-password", async (req, res) => {   //route qui demande la reinitialisation
  try {
    if (!checkBody(req.body, ["email"])) {
      return res.json({ result: false, error: "Email manquant." });
    }

    const email = req.body.email.trim().toLowerCase();  //vérifier email

    const user = await User.findOne({ email });   //retrouver user

    if (!user) {
      return res.json({
        result: true,
        message:
          "Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");   //generer token
    const resetExpires = new Date(Date.now() + 1000 * 60 * 30);  //expiration 

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();   //sauvegarder

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    //envoyer un email avec lien

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: user.email,
      subject: "Réinitialisation de votre mot de passe BUZZ",
      html: `
        <p>Bonjour ${user.prenom},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p>Cliquez sur le lien ci-dessous :</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Ce lien expire dans 30 minutes.</p>
      `,
    });  //renvoie dans les deux cas un message générique, j’ai volontairement renvoyé le même message même si l’email n’existe pas, pour éviter la divulgation d’informations

    res.json({
      result: true,
      message:
        "Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

router.post("/reset-password", async (req, res) => { //route qui finalise la réinitialisation
  try {
    if (!checkBody(req.body, ["token", "password", "confirmPassword"])) {
      return res.json({ result: false, error: "Champs manquants." });
    }

    const { token, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.json({
        result: false,
        error: "Les mots de passe ne correspondent pas.",
      });
    }

    const passwordRegex = /^(?=.*[^A-Za-z0-9])[A-Za-z0-9\S]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.json({
        result: false,
        error:
          "Le mot de passe doit contenir au moins 8 caractères et au moins 1 caractère spécial.",
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.json({
        result: false,
        error: "Lien invalide ou expiré.",
      });
    }

    const hash = bcrypt.hashSync(password, 10);

    user.password = hash;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    res.json({
      result: true,
      message: "Mot de passe réinitialisé avec succès.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
  });
  //vérifie la force du mot de passe, verifie l'expiration et supprime le token apres usage

  router.put("/updatePassengerInfos", async (req, res) => {

  try {
    const { token, firstName, lastName, phone, email } = req.body;

    if (!token) {
      return res.json({ result: false, error: "Token manquant." });
    }

    const user = await User.findOne({ token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable." });
    }

    user.prenom = firstName?.trim() || "";
    user.nom = lastName?.trim() || "";
    user.telephone = phone?.trim() || "";
    user.email = email?.trim().toLowerCase() || "";

    await user.save();

    return res.json({
      result: true,
      message: "Informations passager mises à jour.",
      user: {
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        profilePhoto: user.profilePhoto,
        token: user.token,
        car: user.car,
        driverProfile: user.driverProfile,
        stripeCustomerId: user.stripeCustomerId,
        defaultPaymentMethodId: user.defaultPaymentMethodId,
      },
    });
  } catch (error) {
    console.error("PUT /users/updatePassengerInfos error:", error);
    return res.status(500).json({
      result: false,
      error: "Erreur serveur.",
    });
  }
});

module.exports = router;