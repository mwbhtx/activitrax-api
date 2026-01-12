const mongoClient = require('./mongodb.service.js');
const _ = require('lodash');
const usersDb = mongoClient.db().collection('users');

const ALLOWED_KEYS = ['auth0', 'strava', 'spotify'];

const validateKey = (key) => {
    if (!ALLOWED_KEYS.includes(key)) {
        throw new Error(`Invalid key: ${key}`);
    }
};

// get user access tokens and refresh tokens for a service using key and value args
const getUserTokensByService = async (key, value) => {
    validateKey(key);
    // Fetch the user from the database
    const result = await usersDb.findOne({ [key + '_uid']: _.toString(value) });

    // Get the tokens based on key
    const tokens = {
        access_token: _.get(result, key + '_access_token', null),
        refresh_token: _.get(result, key + '_refresh_token', null)
    }

    return tokens;
}

// update user data in MongoDb
const saveUser = async (key, value, data) => {
    validateKey(key);
    // Update the user in the database
    await usersDb.updateOne({ [key + '_uid']: _.toString(value) }, { $set: data }, { upsert: true });
}

// delete fields from user object in mongodb
const deleteUser = async (key, value, fields) => {
    validateKey(key);
    // delete fields from the user in the database
    await usersDb.updateOne({ [key + '_uid']: _.toString(value) }, { $unset: fields }, { upsert: false });
}

const deleteAppConnections = async (auth0_uid, service) => {
    // set fields to delete
    const deleteFields = {};

    // set fields to delete
    deleteFields[service + '_access_token'] = "";
    deleteFields[service + '_refresh_token'] = "";
    deleteFields[service + '_uid'] = "";

    await deleteUser("auth0", auth0_uid, deleteFields);
}

// fetch user object from mongodb use key and value pair
const getUser = async (key, value) => {
    validateKey(key);
    const result = await usersDb.findOne({ [key + '_uid']: _.toString(value) });
    return result;
}

// Fetch spotify access and refresh token from user object in mongo
const getSpotifyTokens = async (auth0_uid) => {
    // Fetch the user from the database
    const result = await usersDb.findOne({ auth0_uid: auth0_uid })

    // Return the tokens
    return {
        access_token: _.get(result, 'spotify_access_token'),
        refresh_token: _.get(result, 'spotify_refresh_token')
    }
}

// Update user access and refresh tokens
const updateTokens = async (auth0_uid, service_name, access_token, refresh_token) => {
    validateKey(service_name);
    // Update the user in the database
    await usersDb.updateOne({ auth0_uid: auth0_uid }, { $set: { [service_name + '_access_token']: access_token, [service_name + '_refresh_token']: refresh_token } }, { upsert: true });
}

const getStravaTokens = async (auth0_uid) => {
    // Fetch the user from the database
    const result = await usersDb.findOne({ auth0_uid: auth0_uid })

    // Return the tokens
    return {
        access_token: _.get(result, 'strava_access_token'),
        refresh_token: _.get(result, 'strava_refresh_token')
    }
}

module.exports = {
    getSpotifyTokens,
    getStravaTokens,
    getUserTokensByService,
    saveUser,
    getUser,
    updateTokens,
    deleteUser,
    deleteAppConnections,
};