require("dotenv").config();
const request = require("supertest");
const app = require("./app");



const mongoose = require('mongoose')

beforeAll(async () => {
await mongoose.connection.readyState === 1
? Promise.resolve()
: new Promise(resolve => mongoose.connection.once('connected', resolve))
});

afterAll(async () => {
await mongoose.connection.close()
});

it("signin échoue si champs vides", async () => {
  const response = await request(app)
    .post("/users/signin")
    .send({ username: "", password: "" });

  expect(response.body.result).toBe(false);
});
