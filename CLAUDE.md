# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About

Backend for **Buzz**, a carpooling (ride-sharing) app: Express + MongoDB (Mongoose) REST API. The companion React Native app lives in a sibling repo, `AppBuzzFront`.

## Commands

```bash
npm install
npm start          # node ./bin/www — starts the Express server (default port 3000, or $PORT)
npx jest            # run tests (no "test" script is defined in package.json)
npx jest signin.test.js   # run a single test file
```

Requires a `.env` file (gitignored, not present in the repo) with at least:
- `CONNECTION_STRING` — MongoDB connection string (required at startup; `connectDB()` throws without it)
- `STRIPE_SECRET_KEY`, `STRIPE_API_VERSION` (optional, defaults to `2023-10-16`)
- `FRONTEND_URL` — used to build the password-reset link
- Cloudinary credentials (used for photo/document uploads)

There is currently only one test file (`signin.test.js`, using `supertest` against the exported `app`).

## Architecture

- `app.js` builds the Express app and mounts one router per business domain under a matching path prefix: `/users`, `/payments`, `/bookings`, `/rides`, `/rates`, `/conversations`, `/messages`. `bin/www` creates the HTTP server from that app.
- `config/connectDB.js` is the current Mongoose connection helper (idempotent, called from `app.js` and from a per-router `router.use` middleware in `routes/rides.js`). `models/connection.js` is an older, unused direct-`mongoose.connect` file — don't wire new code to it.
- **No auth middleware / JWT.** Auth is a hand-rolled opaque token (`uid2(32)`) stored on the `users` document (`token` field) at signup/login. Protected routes take the token as a URL param or body field (e.g. `GET /bookings/:token`, `POST /users/uploadDriverDocument` with `token` in body) and look up the user with `User.findOne({ token })`. There is no per-route auth middleware — every handler does its own lookup.
- **Single multi-role user model.** `models/users.js` has one `users` collection for everyone; a user becomes a "driver" simply by having a populated `car` subdocument and `driverProfile` (license/insurance/identity doc URLs, `isVerified`, `isProfileComplete`). There is no separate drivers collection in practice — the `driver` ref on `rides`/`Payment` pointing at a `"drivers"` model is legacy/unused; the actual driver is `ride.user`.
- **Domain models** (`models/`): `rides` (a trip, with lat/lng for departure & destination, `status` lifecycle `published → started → completed`/`cancelled`, live `currentLatitude/currentLongitude` for tracking), `bookings` (a passenger's reservation on a ride, `status` authorized/captured/cancelled, `passengerPresenceStatus` pending/scanned/manual/absent, one booking per `(ride, user)` via unique index), `Payment` (Stripe PaymentIntent bookkeeping, separate from booking's own payment `status`), `rates` (1–5 review, `reviewerRole`/`reviewedRole` driver-or-passenger, unique per `(ride, reviewer, reviewedUser, reviewerRole, reviewedRole)`), `conversations`/`messages` (chat is scoped to a `ride` + `driver` + `passenger` triple, unique per triple; messages carry `visibleTo` driver_only/passenger_only/both and per-role read flags).
- **Routes vs. controllers**: most routers (`bookings`, `payments`, `conversations`, `messages`, `users`) keep handlers inline. `routes/rides.js` and `routes/rates.js` delegate the more complex handlers to `controllers/rides.js` / `controllers/rates.js` — check the controller file, not just the router, when working on rides or ratings logic.
- Ride search (`GET /rides/search`, `GET /rides/available` in `routes/rides.js`) does its own haversine-distance geo filtering in JS (`getDistanceMeters`, `minutesToMeters` helpers) rather than a Mongo geo index — walking-distance tolerance (`pickupWalkMinutes`/`dropoffWalkMinutes`) is converted to a radius in meters at ~150m/minute.
- Stripe flow: `payments` routes handle SetupIntent/PaymentMethod setup and preauth (`authorize-payment` / `authorize-payment-onetime`) → capture (`capture-payment`) → cancel, separate from the `rides`/`bookings` state machine that tracks ride/seat status. `Payment` records track the Stripe side; `bookings.status`/`finalAmount` track the business side.
- Some route files contain large blocks of commented-out legacy code after `module.exports = router` (e.g. `routes/rides.js`) — this is dead code left in place, not active behavior; don't assume it runs.
- Deployed to Vercel as a serverless function (`vercel.json` routes everything to `app.js` via `@vercel/node`).
