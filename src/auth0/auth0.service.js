const stravaApi = require('../strava/strava.api.js');
const spotifyApi = require('../spotify/spotify.api.js');
const mongoUserDb = require('../mongodb/user.repository.js');
const _ = require('lodash');

/**
 * Validates that a connected service's tokens are still valid.
 * If revoked, automatically disconnects the service and records the disconnection.
 * @returns {{ valid: boolean, revoked: boolean }} validation result
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
        return { valid: true, revoked: false };
    } catch (error) {
        // If TokenRevokedException, the sendApiRequest already cleaned up the tokens
        // Now record this disconnection so we can show a persistent warning
        if (error.name === 'TokenRevokedException') {
            console.log(`${service} token revoked for user ${auth0_uid}, disconnected at login`);
            await addDisconnectedService(auth0_uid, service);
            return { valid: false, revoked: true };
        }
        // For other errors (network issues, rate limits), assume still connected
        // We don't want to disconnect users due to temporary service issues
        console.log(`${service} validation error (not disconnecting):`, error.message);
        return { valid: true, revoked: false };
    }
};

/**
 * Records a service as disconnected due to revocation.
 * This persists until the user reconnects the service.
 */
const addDisconnectedService = async (auth0_uid, service) => {
    const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
    const currentDisconnected = _.get(userProfile, 'disconnected_services', []);
    if (!currentDisconnected.includes(service)) {
        currentDisconnected.push(service);
        await mongoUserDb.saveUser("auth0", auth0_uid, { disconnected_services: currentDisconnected });
    }
};

/**
 * Clears a service from the disconnected list when user reconnects.
 */
const clearDisconnectedService = async (auth0_uid, service) => {
    const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
    const currentDisconnected = _.get(userProfile, 'disconnected_services', []);
    const updated = currentDisconnected.filter(s => s !== service);
    await mongoUserDb.saveUser("auth0", auth0_uid, { disconnected_services: updated });
};

const getUserConfigForClient = async (auth0_uid) => {
    const userProfile = await mongoUserDb.getUser("auth0", auth0_uid);
    const userConfig = {};

    // Check if tokens exist
    userConfig.strava = !!_.get(userProfile, "strava_access_token");
    userConfig.spotify = !!_.get(userProfile, "spotify_access_token");

    // Return persisted disconnected services from database
    userConfig.disconnected_services = _.get(userProfile, 'disconnected_services', []);

    // User preferences (default to true if not set)
    userConfig.strava_description_enabled = _.get(userProfile, "strava_description_enabled", true);

    return userConfig;
}


module.exports = {
    getUserConfigForClient,
    clearDisconnectedService
};