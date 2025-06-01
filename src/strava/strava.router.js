const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware.js");
const stravaRouter = express.Router();
const _ = require('lodash');
const mongo = require("../mongo/mongoservice.js");

stravaRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const strava_uid = req.query.user_id
        const user_profile = await mongo.getStravaUserProfile(strava_uid);
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
        await mongo.reprocessLastStravaActivity(strava_uid);
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post('/webhook_callback', async (req, res) => {
    try {
        const { owner_id, object_id, aspect_type, object_type } = req.body;
        console.log('webhook post received', owner_id, object_id, aspect_type)
        res.status(200).json({ message: 'success' });
        if (aspect_type === 'create' && object_type === 'activity') {
            await mongo.processStravaActivityCreated(owner_id, object_id);
        }

    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

stravaRouter.get('/webhook_details', validateAccessToken, async (req, res) => {
    try {
        const details = await mongo.getStravaWebhookDetails();
        res.status(200).json({ message: 'success' });
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
        if (hub_verify_token === process.env.STRAVA_WEBOHOOK_VERIFY_TOKEN) {
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

stravaRouter.post('/webhook_create', validateAccessToken, async (req, res) => {
    try {
        await mongo.createStravaWebhook();
        res.status(200).json({ message: 'success' })
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

stravaRouter.post('/webhook_delete', validateAccessToken, async (req, res) => {
    try {
        await mongo.deleteStravaWebhook();
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
        const user_id = req.auth.payload.sub;
        await mongo.exchangeStravaAuthToken(user_id, auth_token);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { stravaRouter };
