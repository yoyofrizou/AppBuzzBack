require('dotenv').config();
require('./models/connection');

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
const reviewRouter = require('./routes/reviews');
const conversationsRouter = require('./routes/conversations');

const usersRouter = require("./routes/users");
const ridesRouter = require("./routes/rides");
const paymentsRouter = require("./routes/payments");
const bookingsRouter = require('./routes/bookings');

var app = express();

const fileUpload = require("express-fileupload");

const cors = require('cors');
app.use(cors());

app.use(fileUpload());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/reviews', reviewRouter);
app.use('/conversations', conversationsRouter);

app.use("/users", usersRouter);
app.use("/rides", ridesRouter);
app.use("/payments", paymentsRouter);
app.use('/bookings', bookingsRouter);

module.exports = app;