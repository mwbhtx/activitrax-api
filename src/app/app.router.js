const express = require("express");
const { validateAccessToken } = require("../middleware/auth0.middleware");
const appRouter = express.Router();
const auth0Service = require("../auth0/auth0.service");
const mongoUserDb = require("../mongodb/user.repository");

/*
* App Router
* Handles application functionality routes
*/

appRouter.get("/user_config", validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const config = await auth0Service.getUserConfigForClient(user_id);
        res.status(200).json(config);
    } catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

appRouter.post('/disconnect_service', validateAccessToken, async (req, res) => {
    try {
        const uid = req.auth.payload.sub;
        const service = req.body.service_name;
        await mongoUserDb.deleteAppConnections(uid, service);
        res.status(200).json({ message: 'success' });
    }
    catch (error) {
        const error_message = _.get(error, 'response.data');
        console.log(JSON.stringify(error_message) || error);
        res.status(500).json({ message: 'server error' });
    }
})

module.exports = { appRouter };