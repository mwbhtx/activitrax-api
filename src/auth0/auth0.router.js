const express = require("express");

const axios = require("axios");

const { validateAccessToken } = require("../middleware/auth0.middleware.js");

const auth0Router = express.Router();

const _ = require('lodash');

const {
    getUserConfig, deleteUserConnectionData, searchAuth0UserByStravaId
} = require("../auth0/auth0.service");

auth0Router.get("/user_config", validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const config = await getUserConfig(user_id);
        res.status(200).json(config);
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

auth0Router.get('/user/:strava_id', validateAccessToken, async (req, res) => {

    try {
        const strava_id = req.params.strava_id;
        const user = await searchAuth0UserByStravaId(strava_id);
        res.status(200).json(user);
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

})

auth0Router.post('/disconnect_service', validateAccessToken, async (req, res) => {

    try {
        const uid = req.auth.payload.sub;
        const service = req.body.service_name;
        await deleteUserConnectionData(uid, service);
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }

})

module.exports = { auth0Router };
