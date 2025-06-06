const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware.js");
const mongo = require("../mongo/mongoservice.js");
const spotifyRouter = express.Router();
const _ = require('lodash');

spotifyRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const spotify_uid = req.query.user_id
        const user_profile = await mongo.getSpotifyUserDetails(spotify_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

spotifyRouter.post("/exchange_token", validateAccessToken, async (req, res) => {
    try {
        const auth_token = req.body.auth_token;
        const user_id = req.auth.payload.sub;
        await mongo.connectSpotifyService(user_id, auth_token);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { spotifyRouter };
