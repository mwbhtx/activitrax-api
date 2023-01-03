const express = require("express");

const axios = require("axios");

const { validateAccessToken } = require("../middleware/auth0.middleware.js");

const {
    setUserConnectionData, addUserConnectionData
} = require("../auth0/auth0.service");

const { connectSpotifyService, getSpotifyUserProfile } = require("./spotify.service");

const spotifyRouter = express.Router();


spotifyRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const auth0_token = req.auth.token
        const spotify_uid = req.query.user_id
        const user_profile = await getSpotifyUserProfile(auth0_token, spotify_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }

})

spotifyRouter.post("/exchange_token", validateAccessToken, async (req, res) => {

    try {
        const auth_token = req.body.auth_token;
        const user_id = req.auth.payload.sub;
        await connectSpotifyService(user_id, auth_token);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }

});

module.exports = { spotifyRouter };
