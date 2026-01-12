const express = require("express");
const { validateAccessToken, isAdmin } = require("../middleware/auth0.middleware");
const userRouter = express.Router();
const mongoActivityDb = require("../mongodb/activity.repository");
const mongoTracklistDb = require("../mongodb/tracklist.repository");
const mongoUserDb = require("../mongodb/user.repository");
const auth0Service = require("../auth0/auth0.service");
const _ = require('lodash');
const stravaApi = require('../strava/strava.api.js');

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
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

userRouter.get('/tracklist/:activityId', validateAccessToken, async (req, res) => {
    try {
        const activity_id = parseInt(req.params.activityId, 10);
        const tracklist = await mongoTracklistDb.getTracklist(activity_id);
        res.status(200).json(tracklist?.tracklist || []);
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
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
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
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
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
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
                    console.log('Strava deauthorization failed (token may already be revoked):', deauthError.message);
                }
            }
        }

        await mongoUserDb.deleteAppConnections(uid, service);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { userRouter };
