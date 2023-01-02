const { auth } = require("express-oauth2-jwt-bearer");
const dotenv = require("dotenv");

dotenv.config();

const validateAccessToken = auth({
  issuerBaseURL: `https://dev-lpah3aos.us.auth0.com`,
  audience: process.env.AUTH0_AUDIENCE,
});

module.exports = {
  validateAccessToken,
};
