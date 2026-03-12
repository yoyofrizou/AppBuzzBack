var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

const User = require("../models/users");
const { checkBody } = require("../modules/checkBody");
const uid2 = require("uid2");
const bcrypt = require("bcrypt");
const uniqid = require("uniqid");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post("/register", async (req, res) => {
  const photoPath = `/tmp/${uniqid()}.jpg`;

  try {
    console.log("BODY REGISTER:", req.body);
    console.log("FILES REGISTER:", req.files);

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
    console.log("Hash OK");

    await req.files.profilePhoto.mv(photoPath);
    console.log("Photo déplacée :", photoPath);

    const resultCloudinary = await cloudinary.uploader.upload(photoPath);
    console.log("Cloudinary OK :", resultCloudinary.secure_url);

    fs.unlinkSync(photoPath);
    console.log("Tmp supprimé");

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
    });

    const savedUser = await newUser.save();
    console.log("User saved :", savedUser._id);

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

module.exports = router;