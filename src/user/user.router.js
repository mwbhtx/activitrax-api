const express = require("express");
const { validateAccessToken, isAdmin } = require("../middleware/auth0.middleware");
const userRouter = express.Router();
const mongoActivityDb = require("../mongodb/activity.repository");
const mongoTracklistDb = require("../mongodb/tracklist.repository");
const mongoUserDb = require("../mongodb/user.repository");
const auth0Service = require("../auth0/auth0.service");
const stravaApi = require('../strava/strava.api.js');
const logger = require('../logger');
const likedTracksRepository = require("../mongodb/liked_tracks.repository");

/*
* User Router
* Handles user-specific data endpoints
*/

userRouter.get('/activities', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const activities = await mongoActivityDb.getActivities(user_id);
        res.status(200).json(activities);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.get('/tracklist/:activityId', validateAccessToken, async (req, res) => {
    try {
        const activity_id = parseInt(req.params.activityId, 10);
        const tracklist = await mongoTracklistDb.getTracklist(activity_id);
        res.status(200).json(tracklist?.tracklist || []);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.get('/config', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const config = await auth0Service.getUserConfigForClient(user_id);
        config.is_admin = isAdmin(req);
        res.status(200).json(config);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.patch('/config', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const updates = req.body;

        // Only allow specific keys to be updated
        const allowedKeys = ['strava_description_enabled'];
        const filteredUpdates = {};

        for (const key of allowedKeys) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        if (Object.keys(filteredUpdates).length > 0) {
            await mongoUserDb.saveUser('auth0', uid, filteredUpdates);
        }

        res.status(200).json({ message: 'success' });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.post('/validate-connections', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const result = await auth0Service.validateConnections(user_id);
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.post('/disconnect', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const service = req.body.service_name;

        // If disconnecting Strava, try to deauthorize with Strava first
        // If this fails (e.g., token already revoked), continue with cleanup
        if (service === 'strava') {
            const userProfile = await mongoUserDb.getUser("auth0", uid);
            if (userProfile?.strava_access_token) {
                try {
                    await stravaApi.deauthorizeUser(userProfile.strava_access_token);
                } catch (deauthError) {
                    logger.warn({ err: deauthError }, 'Strava deauthorization failed (token may already be revoked)');
                }
            }
        }

        await mongoUserDb.deleteAppConnections(uid, service);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

// Like a track
userRouter.post('/liked-tracks', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const trackData = req.body.track;

        if (!trackData || !trackData.spotify_track_id) {
            return res.status(400).json({ message: 'track with spotify_track_id is required' });
        }

        const result = await likedTracksRepository.likeTrack(uid, trackData);
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

// Get liked track IDs (for dashboard state)
// NOTE: This route must be defined BEFORE /liked-tracks/:spotify_track_id
userRouter.get('/liked-tracks/ids', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const likedTrackIds = await likedTracksRepository.getLikedTrackIds(uid);
        res.status(200).json({ liked_track_ids: likedTrackIds });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

// Unlike a track
userRouter.delete('/liked-tracks/:spotify_track_id', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const spotify_track_id = req.params.spotify_track_id;

        const result = await likedTracksRepository.unlikeTrack(uid, spotify_track_id);
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

// Get liked tracks with full metadata (for liked tracks page)
userRouter.get('/liked-tracks', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const tracks = await likedTracksRepository.getLikedTracksWithMetadata(uid);
        res.status(200).json({ tracks });
    } catch (error) {
        logger.error({ err: error }, 'request failed');
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { userRouter };
