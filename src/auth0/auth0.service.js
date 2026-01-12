const stravaService = require('../strava/strava.service.js');
const stravaApi = require('../strava/strava.api.js');
const spotifyApi = require('../spotify/spotify.api.js');
const mongoUserDb = require('../mongodb/user.repository.js');
const _ = require('lodash');

/**
 * Validates that a connected service's tokens are still valid.
 * If revoked, automatically disconnects the service.
 * @returns {boolean} true if valid, false if revoked/disconnected
 */
const validateServiceConnection = async (auth0_uid, service, serviceUid, tokens) => {
    try {
        if (service === 'strava') {
            // Make a lightweight API call to validate the token
            await stravaApi.getUser(serviceUid);
        } else if (service === 'spotify') {
            // Make a lightweight API call to validate the token
            await spotifyApi.getUser(serviceUid, tokens);
        }
        return true;
    } catch (error) {
        // If TokenRevokedException, the sendApiRequest already cleaned up
        if (error.name === 'TokenRevokedException') {
            console.log(`${service} token revoked for user ${auth0_uid}, disconnected at login`);
            return false;
        }
        // For other errors (network issues, rate limits), assume still connected
        // We don't want to disconnect users due to temporary service issues
        console.log(`${service} validation error (not disconnecting):`, error.message);
        return true;
    }
};

const getUserConfigForClient = async (auth0_uid) => {
    const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
    const userConfig = {}

    // Validate Strava connection if tokens exist
    if (_.get(userProfile, "strava_access_token")) {
        const stravaUid = _.get(userProfile, "strava_uid");
        const isValid = await validateServiceConnection(auth0_uid, 'strava', stravaUid, null);
        userConfig.strava = isValid;
    }

    // Validate Spotify connection if tokens exist
    if (_.get(userProfile, "spotify_access_token")) {
        const spotifyUid = _.get(userProfile, "spotify_uid");
        const spotifyTokens = {
            access_token: _.get(userProfile, "spotify_access_token"),
            refresh_token: _.get(userProfile, "spotify_refresh_token")
        };
        const isValid = await validateServiceConnection(auth0_uid, 'spotify', spotifyUid, spotifyTokens);
        userConfig.spotify = isValid;
    }

    if (_.get(userProfile, "last_strava_activity")) {
        userConfig.last_strava_activity = await stravaService.minifyActivityDetails(_.get(userProfile, "last_strava_activity"))
    }

    // User preferences (default to true if not set)
    userConfig.strava_description_enabled = _.get(userProfile, "strava_description_enabled", true);

    return userConfig;
}


module.exports = {
    getUserConfigForClient
};