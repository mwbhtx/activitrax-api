const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware.js");
const auth0Router = express.Router();
const _ = require('lodash');
const mongo = require("../mongodb/mongodb.service.js");

auth0Router.get("/user_config", validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const config = await mongo.getUserConfigForClient(user_id);
        res.status(200).json(config);
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

auth0Router.post('/disconnect_service', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const service = req.body.service_name;
        await mongo.deleteUserConnectionData(uid, service);
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

module.exports = { auth0Router };
