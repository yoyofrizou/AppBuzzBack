const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  if (!process.env.CONNECTION_STRING) {
    throw new Error("CONNECTION_STRING manquante dans les variables d'environnement");
  }

  await mongoose.connect(process.env.CONNECTION_STRING);

  isConnected = true;
  console.log("Database connected");
}

module.exports = connectDB;