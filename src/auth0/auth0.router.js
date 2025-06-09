const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware");
const auth0Router = express.Router();

/*
* Auth0 Router
* Handles auth0 related routes
*/

module.exports = { auth0Router };