const mongoClient = require('./mongodb.service.js');
const _ = require('lodash');
const usersDb = mongoClient.db().collection('users');

// get user access tokens and refresh tokens for a service using key and value args
const getUserTokensByService = async (key, value) => {
    try {
        // Fetch the user from the database
        const result = await usersDb.findOne({ [key + '_uid']: _.toString(value) });

        // Get the tokens based on key
        const tokens = {
            access_token: _.get(result, key + '_access_token', null),
            refresh_token: _.get(result, key + '_refresh_token', null)
        }

        return tokens;

    } catch (err) {
        console.log(err.stack);
    }
}

// // update user data in MongoDb
const saveUser = async (key, value, data) => {
    try {
        // Update the user in the database
        await usersDb.updateOne({ [key + '_uid']: _.toString(value) }, { $set: data }, { upsert: true });

    } catch (err) {
        console.log(err.stack);
    }
}

// delete fields from user object in mongodb
const deleteUser = async (key, value, fields) => {
    try {
        // delete fields from the user in the database
        await usersDb.updateOne({ [key + '_uid']: _.toString(value) }, { $unset: fields }, { upsert: false });
    }
    catch (err) {
        console.log(err.stack);
    }
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
    try {
        const result = await usersDb.findOne({ [key + '_uid']: _.toString(value) });
        return result;
    } catch (err) {
        console.log(err.stack);
    }
}

// Fetch spotify access and refresh token from user object in mongo
const getSpotifyTokens = async (auth0_uid) => {
    try {
        // Fetch the user from the database
        const result = await usersDb.findOne({ auth0_uid: auth0_uid })

        // Return the tokens
        return {
            access_token: _.get(result, 'spotify_access_token'),
            refresh_token: _.get(result, 'spotify_refresh_token')
        }
    } catch (err) {
        console.log(err.stack);
    }
}

// Update user access and refresh tokens
const updateTokens = async (auth0_uid, service_name, access_token, refresh_token) => {
    try {
        // Update the user in the database
        await usersDb.updateOne({ auth0_uid: auth0_uid }, { $set: { [service_name + '_access_token']: access_token, [service_name + '_refresh_token']: refresh_token } }, { upsert: true });

    } catch (err) {
        console.log(err.stack);
    }
}

const getStravaTokens = async (auth0_uid) => {
    try {
        // Fetch the user from the database
        const result = await usersDb.findOne({ auth0_uid: auth0_uid })

        // Return the tokens
        return {
            access_token: _.get(result, 'strava_access_token'),
            refresh_token: _.get(result, 'strava_refresh_token')
        }
    }
    catch (err) {
        console.log(err.stack);
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