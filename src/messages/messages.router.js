const express = require("express");
const axios = require("axios");

const {
  getAdminMessage,
  getProtectedMessage,
  getPublicMessage,
} = require("./messages.service");
const { validateAccessToken } = require("../middleware/auth0.middleware.js");

const messagesRouter = express.Router();

// Test a public route request
messagesRouter.get("/public", (req, res) => {
  const message = getPublicMessage();
  res.status(200).json(message);
});

// Test a protected route request
messagesRouter.get("/protected", validateAccessToken, (req, res) => {
  const message = getProtectedMessage();
  res.status(200).json(message);
});

// Test an admin route request
messagesRouter.get("/admin", validateAccessToken, (req, res) => {
  const message = getAdminMessage();
  res.status(200).json(message);
});

// Request Auth0 Management API token
messagesRouter.get("/auth0_management_token", validateAccessToken, (req, res) => {
  var options = {
    method: 'POST',
    url: 'https://dev-lpah3aos.us.auth0.com/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_M2M_CLIENT_ID,
      client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
      audience: process.env.AUTH0_AUDIENCE
    })
  };

  // fetch m2m management token from auth0
  // TODO: Protect this route so that users must have the admin role to access it
  axios.request(options)
    .then(function (response) {
      const auth0_management_token = response.data.access_token;
      res.status(200).json({ token: auth0_management_token });
    }
    ).catch(function (error) {
      console.error(error);
      res.status(500).json({ message: 'server error' });
    });
});

module.exports = { messagesRouter };
