const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware");
const spotifyRouter = express.Router();
const _ = require('lodash');
const spotifyApi = require("./spotify.api");
const spotifyService = require("./spotify.service");
const mongoUserDb = require('../mongodb/user.repository.js');

spotifyRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const spotify_uid = req.query.user_id
        const user_profile = await spotifyApi.getUser(spotify_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

spotifyRouter.get('/tracklist', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const start_time = req.query.start_time;
        const end_time = req.query.end_time;
        const userProfile = await mongoUserDb.getUser("auth0", user_id);
        const tracks = await spotifyApi.getTracklist(userProfile.spotify_uid, {
            access_token: userProfile.spotify_access_token,
            refresh_token: userProfile.spotify_refresh_token
        }, start_time, end_time);
        res.status(200).json(tracks);
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

spotifyRouter.post("/exchange_token", validateAccessToken, async (req, res) => {
    try {
        const auth_token = req.body.auth_token;
        const user_id = req.auth.payload.sub;
        await spotifyService.exchangeAuthToken(user_id, auth_token);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { spotifyRouter };
