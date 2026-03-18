const express = require("express");
const { validateAccessToken, isAdmin } = require("../middleware/auth0.middleware");
const spotifyRouter = express.Router();
const spotifyApi = require("./spotify.api");
const spotifyService = require("./spotify.service");
const mongoUserDb = require('../mongodb/user.repository.js');
const auth0Service = require('../auth0/auth0.service.js');
const logger = require('../logger');

spotifyRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const spotify_uid = req.query.user_id;
        const auth0_uid = req.auth.payload.sub;

        // Check ownership or admin role
        const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
        const isOwner = userProfile?.spotify_uid === spotify_uid;
        if (!isOwner && !isAdmin(req)) {
            return res.status(403).json({ message: 'forbidden' });
        }

        const user_profile = await spotifyApi.getUser(spotify_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        logger.error({ err: error }, 'request failed');
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
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

spotifyRouter.post("/exchange_token", validateAccessToken, async (req, res) => {
    try {
        const auth_token = req.body.auth_token;
        const scopes = req.body.scopes;
        const user_id = req.auth.payload.sub;
        await spotifyService.exchangeAuthToken(user_id, auth_token, scopes);
        // Clear any disconnection warning now that user has reconnected
        await auth0Service.clearDisconnectedService(user_id, 'spotify');
        res.status(200).json({ message: 'success' });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

spotifyRouter.get('/playlists', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const userProfile = await mongoUserDb.getUser("auth0", user_id);

        // Check if user has playlist permissions
        const allowedScopes = userProfile.spotify_oauth_allows || [];
        if (!allowedScopes.includes('playlist-modify-private')) {
            return res.status(403).json({
                message: 'insufficient_scope',
                required_scope: 'playlist-modify-private'
            });
        }

        const playlists = await spotifyApi.getUserPlaylists(userProfile.spotify_uid, {
            access_token: userProfile.spotify_access_token,
            refresh_token: userProfile.spotify_refresh_token
        });
        res.status(200).json(playlists);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

spotifyRouter.post('/playlists/:playlistId/tracks', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const playlistId = req.params.playlistId;
        const trackUri = req.body.track_uri;

        if (!trackUri) {
            return res.status(400).json({ message: 'track_uri is required' });
        }

        const userProfile = await mongoUserDb.getUser("auth0", user_id);

        // Check if user has playlist permissions
        const allowedScopes = userProfile.spotify_oauth_allows || [];
        if (!allowedScopes.includes('playlist-modify-private')) {
            return res.status(403).json({
                message: 'insufficient_scope',
                required_scope: 'playlist-modify-private'
            });
        }

        await spotifyApi.addTrackToPlaylist(userProfile.spotify_uid, {
            access_token: userProfile.spotify_access_token,
            refresh_token: userProfile.spotify_refresh_token
        }, playlistId, trackUri);

        res.status(200).json({ message: 'success' });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { spotifyRouter };
