const { auth } = require("express-oauth2-jwt-bearer");
const dotenv = require("dotenv");

dotenv.config();

const ROLES_CLAIM = 'https://activitrax.app/roles';

const validateAccessToken = auth({
  issuerBaseURL: process.env.AUTH0_ISSUER_URL,
  audience: process.env.AUTH0_AUDIENCE,
});

const isAdmin = (req) => {
  const roles = req.auth?.payload?.[ROLES_CLAIM] || [];
  return roles.includes('admin');
};

const requireAdmin = (req, res, next) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'forbidden' });
  }
  next();
};

module.exports = {
  validateAccessToken,
  isAdmin,
  requireAdmin,
};
