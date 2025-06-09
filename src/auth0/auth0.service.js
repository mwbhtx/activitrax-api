const stravaService = require('../strava/strava.service.js');
const mongoUserDb = require('../mongodb/user.repository.js');
const _ = require('lodash');

const getUserConfigForClient = async (auth0_uid) => {
    const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
    const userConfig = {}

    if (_.get(userProfile, "strava_access_token")) {
        userConfig.strava = true
    }

    if (_.get(userProfile, "spotify_access_token")) {
        userConfig.spotify = true
    }

    if (_.get(userProfile, "last_strava_activity")) {
        userConfig.last_strava_activity = await stravaService.minifyActivityDetails(_.get(userProfile, "last_strava_activity"))
    }

    return userConfig;
}


module.exports = {
    getUserConfigForClient
};