require('dotenv').config();

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const mongoose = require("mongoose");
const cors = require("cors");

var indexRouter = require('./routes/index');
const usersRouter = require("./routes/users");

/*
const reviewRouter = require('./routes/reviews');
const conversationsRouter = require('./routes/conversations');
const ridesRouter = require("./routes/rides");
const paymentsRouter = require("./routes/payments");
const bookingsRouter = require('./routes/bookings');

const fileUpload = require("express-fileupload");*/

var app = express();

mongoose
  .connect(process.env.CONNECTION_STRING)
  .then(() => console.log("Database connected"))
  .catch((error) => console.error(error));

app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/", indexRouter);
app.use("/users", usersRouter);

app.use(function (req, res, next) {
  next(createError(404));
});

module.exports = app;

/*app.use(fileUpload());

app.use(logger('dev'));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/reviews', reviewRouter);
app.use('/conversations', conversationsRouter);


app.use("/rides", ridesRouter);
app.use("/payments", paymentsRouter);
app.use('/bookings', bookingsRouter);*/



