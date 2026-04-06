require("dotenv").config(); //charge les variables de .env comme ca je peux utiliser dans mon code des process.env.CONNECTION_STRING

var createError = require("http-errors"); //importes la librairie http-errors
var express = require("express"); //créé mon serveur backend
var logger = require("morgan"); //sert à suivre les requêtes pendant le développement (methodes, temps de rep etc)
const mongoose = require("mongoose"); //connecte le backend à MongoDB et sert à manipuler les modèles
const cors = require("cors"); //autorise ton frontend à communiquer avec ton backend
const fileUpload = require("express-fileupload");

const connectDB = require("./config/connectDB");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
const paymentsRouter = require("./routes/payments");
const bookingsRouter = require("./routes/bookings");
const ridesRouter = require("./routes/rides");
const ratesRouter = require("./routes/rates");
const conversationsRouter = require("./routes/conversations");
const messagesRouter = require("./routes/messages");

var app = express();

connectDB().catch((error) => {
  console.error("MongoDB connection error:", error.message);
});

app.use(cors());
app.use(logger("dev"));

app.use(express.json()); //lire les requêtes envoyées en JSON : Quand frontend envoie : "email": ..., "password": ..., ca me epr met de le recup dans req.body
app.use(express.urlencoded({ extended: true })); //lire des données envoyées sous forme de formulaire


app.use(           //fichier stocké temporairement dans un dossier et le dossier temporaire utilisé est /tmp/ ; Ça évite de tout garder directement en mémoire
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/", indexRouter);      //Quand quelqu’un appelle /, c’est ce router qui répond
app.use("/users", usersRouter);  //Je relie ici le module des utilisateurs au préfixe /users

app.use("/payments", paymentsRouter);
app.use("/bookings", bookingsRouter);
app.use("/rides", ridesRouter);   //Toutes les routes de trajet commenceront par /rides
app.use("/rates", ratesRouter);
app.use("/conversations", conversationsRouter);
app.use("/messages", messagesRouter);

//j'ai organise mon backend par domaines métier, par fonctionnalites

app.use(function (req, res, next) {   //s’exécute si aucune route au-dessus n’a répondu et cree une erreur 404 route introuvable 
  next(createError(404)); 
});

app.use(function (err, req, res, next) {  //récupère les erreurs et renvoie toujours une réponse JSON propre, pour renvoyer des réponses uniformes au frontend
  res.status(err.status || 500).json({
    result: false,
    error: err.message,
  });
});

module.exports = app;    // exportes mon application Express, ca permet à un autre fichier, souvent bin/www ou server.js, d’importer mon app et de lancer le serveur


