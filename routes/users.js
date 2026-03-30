var express = require("express");
var router = express.Router();

const User = require("../models/users");
const { checkBody } = require("../modules/checkBody");
const uid2 = require("uid2");
const bcrypt = require("bcrypt");
const uniqid = require("uniqid");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

const nodemailer = require("nodemailer");
const crypto = require("crypto");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    res.json({ result: true, users });
  } catch (error) {
    res.status(500).json({ result: false, error: error.message });
  }
});

router.post("/test-create", async (req, res) => {
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

router.post("/register", async (req, res) => {
  const photoPath = `/tmp/${uniqid()}.jpg`;

  try {

    if (
      !checkBody(req.body, [
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

    if (req.body.password !== req.body.confirmPassword) {
      return res.json({
        result: false,
        error: "Les mots de passe ne correspondent pas.",
      });
    }

    if (!req.files || !req.files.profilePhoto) {
      return res.json({ result: false, error: "Photo de profil obligatoire." });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: req.body.email.trim().toLowerCase() },
        { telephone: req.body.telephone.trim() },
      ],
    });

    if (existingUser) {
      return res.json({ result: false, error: "Utilisateur déjà existant." });
    }

    const hash = bcrypt.hashSync(req.body.password, 10);
    

    await req.files.profilePhoto.mv(photoPath);


    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
   

    fs.unlinkSync(photoPath);
   

    const newUser = new User({
      prenom: req.body.prenom.trim(),
      nom: req.body.nom.trim(),
      email: req.body.email.trim().toLowerCase(),
      telephone: req.body.telephone.trim(),
      password: hash,
      token: uid2(32),
      profilePhoto: resultCloudinary.secure_url,
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
    });
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
    if (!checkBody(req.body, ["email", "password"])) {
      res.json({ result: false, error: "Missing or empty fields" });
      return;
    }

    const data = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
    });

    if (data && bcrypt.compareSync(req.body.password, data.password)) {
      res.json({
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

router.delete("/delete/:token", async (req, res) => {
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

router.post("/addCar", async (req, res) => {
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

router.post("/upload", async (req, res) => {
  const photoPath = `/tmp/${uniqid()}.jpg`;

  try {
    if (!req.body.token) {
      res.json({ result: false, error: "Token manquant" });
      return;
    }

    if (!req.files || !req.files.photoFromFront) {
      res.json({ result: false, error: "No file uploaded" });
      return;
    }

    await req.files.photoFromFront.mv(photoPath);
    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
    fs.unlinkSync(photoPath);

    const user = await User.findOne({ token: req.body.token });

    if (!user) {
      res.json({ result: false, error: "User not found" });
      return;
    }

    user.photos = [...user.photos, resultCloudinary.secure_url];
    await user.save();

    res.json({ result: true, url: resultCloudinary.secure_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

router.put("/updateProfilePhoto", async (req, res) => {
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
    if (!req.body.token) {
      return res.json({ result: false, error: "Token manquant." });
    }

    if (!req.body.documentType) {
      return res.json({ result: false, error: "Type de document manquant." });
    }

    if (!req.files || !req.files.document) {
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

    await req.files.document.mv(photoPath);
    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
    fs.unlinkSync(photoPath);

    const user = await User.findOne({ token: req.body.token });

    if (!user) {
      return res.json({ result: false, error: "Utilisateur introuvable." });
    }

    if (!user.driverProfile) {
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

router.put("/updateDriverProfile", async (req, res) => {
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

router.post("/deletePicture", async (req, res) => {
  try {
    if (!checkBody(req.body, ["token", "photoUrl"])) {
      res.json({ result: false, error: "Missing fields" });
      return;
    }

    const user = await User.findOne({ token: req.body.token });

    if (!user) {
      res.json({ result: false, error: "User not found" });
      return;
    }

    user.photos = user.photos.filter((photo) => photo !== req.body.photoUrl);
    await user.save();

    res.json({ result: true, message: "Photo supprimée avec succès" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ result: false, error: "Erreur serveur." });
  }
});

  
router.post("/forgot-password", async (req, res) => {
  try {
    if (!checkBody(req.body, ["email"])) {
      return res.json({ result: false, error: "Email manquant." });
    }

    const email = req.body.email.trim().toLowerCase();

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        result: true,
        message:
          "Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 1000 * 60 * 30);

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

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
    });

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

router.post("/reset-password", async (req, res) => {
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