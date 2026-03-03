require('dotenv').config();
require('./models/connection');

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var bookingRouter = require('./routes/bookings');
var reviewRouter = require('./routes/reviews');
var rideRouter = require('./routes/rides');
var conversationsRouter = require('./routes/conversations');

var app = express();

const cors = require('cors');
app.use(cors());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/bookings', bookingRouter);
app.use('/rides', rideRouter);
app.use('/reviews', reviewRouter);
app.use('/conversations', conversationsRouter);

module.exports = app;
