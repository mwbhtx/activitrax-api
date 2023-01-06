const express = require("express");

const axios = require("axios");

const { validateAccessToken } = require("../middleware/auth0.middleware.js");

const {
    setUserConnectionData, deleteUserConnectionData
} = require("../auth0/auth0.service");

const { exchangeStravaAuthToken, createStravaWebhook, deleteStravaWebhook, getStravaWebhookDetails, processStravaActivityCreated, getStravaUserProfile } = require("./strava.service");

const stravaRouter = express.Router();

const _ = require('lodash');

stravaRouter.post('/disconnect', validateAccessToken, async (req, res) => {

    try {
        const uid = req.auth.payload.sub;
        await deleteUserConnectionData(uid, 'strava');
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

})

stravaRouter.get('/user_profile', validateAccessToken, async (req, res) => {
    try {
        const auth0_token = req.auth.token
        const strava_uid = req.query.user_id
        const user_profile = await getStravaUserProfile(auth0_token, strava_uid);
        res.status(200).json(user_profile);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

})

stravaRouter.post('/webhook_callback', async (req, res) => {

    try {
        const { owner_id, object_id, aspect_type, object_type } = req.body;
        console.log('webhook post received', owner_id, object_id, aspect_type)
        res.status(200).json({ message: 'success' });
        if (aspect_type === 'create' && object_type === 'activity') {
            await processStravaActivityCreated(owner_id, object_id);
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
        const details = await getStravaWebhookDetails();
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
        if (hub_verify_token === process.env.ACTIVITRAX_STRAVA_WEBOHOOK_VERIFY_TOKEN) {
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
        await createStravaWebhook();
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
        await deleteStravaWebhook();
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
        await exchangeStravaAuthToken(user_id, auth_token);
        res.status(200).json({ message: 'success' });
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

});

module.exports = { stravaRouter };
