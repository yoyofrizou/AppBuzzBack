var express = require("express");
var router = express.Router();

/* GET users listing. */
router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const User = require("../models/users");
const { checkBody } = require("../modules/checkBody");
const uid2 = require("uid2");
const bcrypt = require("bcrypt");

const uniqid = require("uniqid");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

router.post("/signup", (req, res) => {
  if (
    !checkBody(req.body, [
      "firstname",
      "lastname",
      "username",
      "email",
      "password",
    ])
  ) {
    res.json({ result: false, error: "Missing or empty fields" });
    return;
  }

  // Check if the user has not already been registered
  User.findOne({ username: req.body.username }).then((data) => {
    if (data === null) {
      const hash = bcrypt.hashSync(req.body.password, 10);

      const newUser = new User({
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        username: req.body.username,
        email: req.body.email,
        password: hash,
        token: uid2(32),
        stripeCustomerId: customer.id,  // paiement
        car: req.body.licencePlate
          ? {
              brand: req.body.brand,
              model: req.body.model,
              color: req.body.color,
              nbSeats: req.body.nbSeats,
              licencePlate: req.body.licencePlate,
            }
          : null,
        // si licencePlate est fourni, il enregistre la voiture, sinon null
      });

      newUser.save().then((newDoc) => {
        res.json({
          result: true,
          token: newDoc.token,
          user: { _id: newDoc._id, email: newDoc.email },
        });
      });
    } else {
      // User already exists in database
      res.json({ result: false, error: "User already exists" });
    }
  });
});

router.post("/signin", (req, res) => {
  if (!checkBody(req.body, ["username", "password"])) {
    res.json({ result: false, error: "Missing or empty fields" });
    return;
  }

  User.findOne({ username: req.body.username }).then((data) => {
    if (data && bcrypt.compareSync(req.body.password, data.password)) {
      res.json({
        result: true,
        token: data.token,
        user: {
          _id: data._id,
          email: data.email,
          firstname: data.firstname,
          lastname: data.lastname,
          username: data.username,
          car: data.car,
          photos: data.photos,
        },
      });
    } else {
      res.json({ result: false, error: "User not found or wrong password" });
    }
  });
});

router.delete("/delete/:token", (req, res) => {
  // On utilise le token passé dans l'URL (params) pour savoir qui supprimer
  User.deleteOne({ token: req.params.token }).then((data) => {
    // deletedCount vaut 1 si quelqu'un a été supprimé, 0 sinon
    if (data.deletedCount > 0) {
      res.json({ result: true, message: "Compte supprimé avec succès" });
    } else {
      res.json({ result: false, error: "Utilisateur non trouvé" });
    }
  });
});

router.post("/addCar", (req, res) => {
  // 1. On vérifie si tous les champs sont bien remplis dans le corps de la requête (req.body)
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
    return; // On arrête tout si un champ manque
  }

  // 2. On cherche l'utilisateur dans la base de données grâce à son token
  User.findOne({ token: req.body.token }).then((data) => {
    if (data) {
      // Si on a trouvé l'utilisateur (data n'est pas nul) :

      // On remplit l'objet "car" de cet utilisateur avec les infos reçues du frontend
      data.car = {
        brand: req.body.brand,
        model: req.body.model,
        color: req.body.color,
        nbSeats: req.body.nbSeats,
        licencePlate: req.body.licencePlate,
      };

      // 3. On sauvegarde les modifications dans la base de données
      data.save().then((updatedUser) => {
        // On renvoie une réponse positive avec les nouvelles infos de la voiture
        res.json({ result: true, car: updatedUser.car });
      });
    } else {
      // Si "data" est nul, c'est que le token n'existe pas
      res.json({ result: false, error: "Utilisateur non trouvé" });
    }
  });
});

router.post("/upload", (req, res) => {
  const photoPath = `./tmp/${uniqid()}.jpg`;
  console.log("token reçu :", req.body.token); // 👈
  console.log("fichier reçu :", req.files?.photoFromFront); // 👈

  if (!req.files || !req.files.photoFromFront) {
    res.json({ result: false, error: "No file uploaded" });
    return;
  }

  req.files.photoFromFront.mv(photoPath).then(() => {
    cloudinary.uploader.upload(photoPath).then((resultCloudinary) => {
      fs.unlinkSync(photoPath); // On cherche l'utilisateur grâce à son token
      
      User.findOne({ token: req.body.token }).then((user) => {
        console.log("user trouvé :", user); 
        
         if (!user) {
          res.json({ result: false, error: "User not found" });
          return;
        }
        // On ajoute la nouvelle URL à la fin du tableau photos existant
        user.photos = [...user.photos, resultCloudinary.secure_url];
        // On sauvegarde l'utilisateur avec la nouvelle photo
        user.save().then(() => {
          res.json({ result: true, url: resultCloudinary.secure_url });
        });
      });
    });
  });
});

router.post("/deletePicture", (req, res) => {
  if (!checkBody(req.body, ["token", "photoUrl"])) {
    res.json({ result: false, error: "Missing fields" });
    return;
  }

  User.findOne({ token: req.body.token }).then((user) => {
    if (!user) {
      res.json({ result: false, error: "User not found" });
      return;
    }

    user.photos = user.photos.filter(
      (photo) => photo !== req.body.photoUrl
    );

    user.save().then(() => {
      res.json({ result: true, message: "Photo supprimée avec succès" });
    });
  });
});


module.exports = router;
