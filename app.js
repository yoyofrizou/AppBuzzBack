require("dotenv").config();

var createError = require("http-errors");
var express = require("express");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const mongoose = require("mongoose");
const cors = require("cors");
const fileUpload = require("express-fileupload");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var ridesRouter = require("./routes/rides");

var app = express();

mongoose
  .connect(process.env.CONNECTION_STRING)
  .then(() => console.log("Database connected"))
  .catch((error) => console.error("MongoDB connection error:", error));

app.use(cors());
app.use(logger("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/rides", ridesRouter);

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  res.status(err.status || 500).json({
    result: false,
    error: err.message,
  });
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



