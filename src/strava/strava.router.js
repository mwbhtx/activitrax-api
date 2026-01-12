const express = require("express");
const { validateAccessToken, isAdmin, requireAdmin } = require("../middleware/auth0.middleware");
const stravaRouter = express.Router();
const _ = require('lodash');
const stravaApi = require('./strava.api.js');
const stravaService = require('./strava.service.js');
const mongoUserDb = require('../mongodb/user.repository.js');
const auth0Service = require('../auth0/auth0.service.js');

stravaRouter.get('/activities', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const userProfile = await mongoUserDb.getUser("auth0", user_id);
        const activities = await stravaApi.getActivities(userProfile.strava_uid, {
            access_token: userProfile.strava_access_token,
            refresh_token: userProfile.strava_refresh_token
        }, req.query.page, req.query.per_page);
        res.status(200).json(activities);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

stravaRouter.get('/activity', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const userProfile = await mongoUserDb.getUser("auth0", user_id);
        const activityDetails = await stravaApi.getActivity(userProfile.strava_uid, {
            access_token: userProfile.strava_access_token,
            refresh_token: userProfile.strava_refresh_token
        }, req.query.activity_id);
        res.status(200).json(activityDetails);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

stravaRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const strava_uid = req.query.user_id;
        const auth0_uid = req.auth.payload.sub;

        // Check ownership or admin role
        const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
        const isOwner = userProfile?.strava_uid === strava_uid;
        if (!isOwner && !isAdmin(req)) {
            return res.status(403).json({ message: 'forbidden' });
        }

        const user_profile = await stravaApi.getUser(strava_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post('/process-last-activity/:strava_uid', validateAccessToken, async (req, res) => {
    try {
        const strava_uid = req.params.strava_uid;
        const auth0_uid = req.auth.payload.sub;

        // Check ownership or admin role
        const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
        const isOwner = userProfile?.strava_uid === strava_uid;
        if (!isOwner && !isAdmin(req)) {
            return res.status(403).json({ message: 'forbidden' });
        }

        await stravaService.reprocessLastStravaActivity(strava_uid);
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post('/webhook_callback', async (req, res) => {
    try {
        const { owner_id, object_id, aspect_type, object_type, subscription_id, updates } = req.body;
        console.log('webhook post received', owner_id, object_id, aspect_type, object_type);

        // Validate subscription_id matches our registered webhook
        if (String(subscription_id) !== process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID) {
            console.log('Invalid subscription_id:', subscription_id);
            return res.status(401).json({ message: 'unauthorized' });
        }

        // Validate the owner exists in our database
        const user = await mongoUserDb.getUser("strava", owner_id);
        if (!user) {
            console.log('Unknown owner_id:', owner_id);
            return res.status(200).json({ message: 'success' }); // Return 200 to avoid Strava retries
        }

        res.status(200).json({ message: 'success' });

        // Handle deauthorization - user revoked access from Strava settings
        if (object_type === 'athlete' && aspect_type === 'update' && updates?.authorized === 'false') {
            console.log('User deauthorized from Strava:', owner_id);
            mongoUserDb.deleteAppConnections(user.auth0_uid, 'strava')
                .catch(err => console.error('deleteAppConnections failed:', err));
            return;
        }

        if (aspect_type === 'create' && object_type === 'activity') {
            // Fire and forget - don't await, to ensure 200 is returned immediately
            stravaService.processActivity(owner_id, object_id)
                .catch(err => console.error('processActivity failed:', err));
        }
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

stravaRouter.get('/webhook_details', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        const details = await stravaApi.getWebhook();
        res.status(200).json(details);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.get('/webhook_callback', async (req, res) => {
    try {
        const hub_challenge = req.query['hub.challenge'];
        const hub_verify_token = req.query['hub.verify_token'];
        if (hub_verify_token === process.env.STRAVA_WEBHOOK_VERIFICATION_TOKEN) {
            res.status(200).json({ "hub.challenge": hub_challenge });
        } else {
            res.status(401).json({ message: 'unauthorized' });
        }
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

})

stravaRouter.post('/webhook_create', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        await stravaApi.createStravaWebhook();
        res.status(200).json({ message: 'success' })
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post('/webhook_delete', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        await stravaApi.deleteWebhook();
        res.status(200).json({ message: 'success' })
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post("/exchange_token", validateAccessToken, async (req, res) => {
    try {
        const auth_token = req.body.auth_token;
        const scopes = req.body.scopes;
        const user_id = req.auth.payload.sub;
        await stravaApi.exchangeAuthToken(user_id, auth_token, scopes);
        // Clear any disconnection warning now that user has reconnected
        await auth0Service.clearDisconnectedService(user_id, 'strava');
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { stravaRouter };
