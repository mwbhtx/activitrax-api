const { MongoClient } = require("mongodb");
// Replace the uri string with your connection string.
const uri = process.env.ACTIVITRAX_MONGO_URI;
const client = new MongoClient(uri);

const _ = require('lodash');

const getUserStravaTokens = async (auth0_uid) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Fetch the user from the database
        const result = await users.findOne({ auth0_uid: auth0_uid })

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

// Fetch spotify access and refresh token from user object in mongo
const getUserSpotifyTokens = async (auth0_uid) => {

    try {

        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Fetch the user from the database
        const result = await users.findOne({ auth0_uid: auth0_uid })

        // Return the tokens
        return {
            access_token: _.get(result, 'spotify_access_token'),
            refresh_token: _.get(result, 'spotify_refresh_token')
        }

    } catch (err) {
        console.log(err.stack);
    }

}

// Update User Record in MongoDb
const updateUserData = async (auth0_uid, data) => {

    try {

        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Update the user in the database
        await users.updateOne({ auth0_uid: auth0_uid }, { $set: data }, { upsert: true });

    } catch (err) {
        console.log(err.stack);
    }

}

// Store Strava Activities in MongoDb
const storeActivityInMongoDB = async (auth0_uid, activity) => {

    try {
        await client.connect();
        const database = client.db('production');
        const activities = database.collection('activities');

        // append auth0_uid to each activity
        activity.auth0_uid = auth0_uid;

        // Store the activities in the database
        await activities.insertOne(activities);

    } catch (err) {
        console.log(err.stack);
    }
}

// Store tracklist in mongodb
const storeTracklistInMongoDB = async (auth0_uid, spotify_tracklist, strava_activity_id) => {

    try {

        await client.connect();
        const database = client.db('production');
        const tracklists = database.collection('tracklists');

        // append auth0_uid to each activity + strava activity id
        spotify_tracklist.auth0_uid = auth0_uid;
        spotify_tracklist.strava_activity_id = strava_activity_id;

        // Store the activities in the database
        await tracklists.insertOne(spotify_tracklist);

    } catch (err) {
        console.log(err.stack);
    }

}

// Fetch tracklist from MongoDb
const fetchTracklist = async (auth0_uid, strava_activity_id) => {

    try {

        await client.connect();
        const database = client.db('production');
        const tracklists = database.collection('tracklists');

        // Fetch the activities from the database
        const result = await tracklists.findOne({ auth0_uid: auth0_uid, strava_activity_id: strava_activity_id })
        return result;

    }
    catch (err) {
        console.log(err.stack);
    }
}

// Fetch Strava Activities from MongoDb 
const fetchStravaActivities = async (auth0_uid) => {

    try {

        await client.connect();
        const database = client.db('production');
        const activities = database.collection('activities');

        // Fetch the activities from the database
        const result = await activities.find({ auth0_uid: auth0_uid }).toArray();
        return result;

    } catch (err) {
        console.log(err.stack);
    }


}

// Update user access and refresh tokens
const updateUserTokens = async (auth0_uid, service_name, access_token, refresh_token) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Update the user in the database
        await users.updateOne({ auth0_uid: auth0_uid }, { $set: { [service_name + '_access_token']: access_token, [service_name + '_refresh_token']: refresh_token } }, { upsert: true });

    } catch (err) {
        console.log(err.stack);
    }

}

// update user data in MongoDb
const updateUserDataByIdMongo = async (key, value, data) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Update the user in the database
        await users.updateOne({ [key + '_uid']: value }, { $set: data }, { upsert: true });

    } catch (err) {
        console.log(err.stack);
    }

}


const deleteUserConnectionData = async (auth0_uid, service) => {


    // set fields to delete
    const deleteFields = {};

    // set fields to delete
    deleteFields[service + '_access_token'] = "";
    deleteFields[service + '_refresh_token'] = "";
    deleteFields[service + '_uid'] = "";

    await deleteUserDataByIdMongo("auth0", auth0_uid, deleteFields);

}

// get most recent strava activity for user
const getLastStravaActivity = async (auth0_uid) => {

    try {
        await client.connect();
        const database = client.db('production');
        const activities = database.collection('activities');

        // Fetch the activities from the database
        const result = await activities.find({ auth0_uid: auth0_uid }).sort({ start_date: -1 }).limit(1).toArray();
        return result;

    } catch (err) {
        console.log(err.stack);
    }
}

const getUserConfigForClient = async (auth0_uid) => {

    const userProfile = await getUserDataByIdMongo("auth0", auth0_uid);

    const userConfig = {}

    if (_.get(userProfile, "strava_access_token")) {
        userConfig.strava = true
    }

    if (_.get(userProfile, "spotify_access_token")) {
        userConfig.spotify = true
    }

    if (_.get(userProfile, "last_strava_activity")) {
        userConfig.last_strava_activity = userProfile.last_strava_activity
    }

    return userConfig;
}


// fetch user object from mongodb use key and value pair
const getUserDataByIdMongo = async (key, value) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Fetch the user from the database
        const result = await users.findOne({ [key + '_uid']: value });

        return result;

    } catch (err) {
        console.log(err.stack);
    }

}

// set user data object in mongodb
const setUserDataByIdMongo = async (key, value, data) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // overwrite the user in the database
        await users.updateOne({ [key + '_uid']: value }, { $set: data }, { upsert: false });

    }
    catch (err) {
        console.log(err.stack);
    }

}

// delete fields from user object in mongodb
const deleteUserDataByIdMongo = async (key, value, fields) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // delete fields from the user in the database
        await users.updateOne({ [key + '_uid']: value }, { $unset: fields }, { upsert: false });
    }
    catch (err) {
        console.log(err.stack);
    }
}

// get user access tokens and refresh tokens for a service using key and value args
const getUserTokensByServiceId = async (key, value) => {

    try {
        await client.connect();
        const database = client.db('production');
        const users = database.collection('users');

        // Fetch the user from the database
        const result = await users.findOne({ [key + '_uid']: value });

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

module.exports = {
    fetchStravaActivities,
    updateUserTokens,
    storeActivityInMongoDB,
    storeTracklistInMongoDB,
    fetchTracklist,
    updateUserData,
    getUserTokensByServiceId,
    getUserStravaTokens,
    getUserConfigForClient,
    getLastStravaActivity,
    getUserSpotifyTokens,
    getUserDataByIdMongo,
    updateUserDataByIdMongo,
    deleteUserConnectionData,
    setUserDataByIdMongo,
    deleteUserDataByIdMongo
}