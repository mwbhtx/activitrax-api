const { MongoClient } = require("mongodb");
// Replace the uri string with your connection string.
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const spotifyClientId = '2d496310f6db494791df2b41b9c2342d'

const _ = require('lodash');
const axios = require('axios')
const spotify = require('../spotify/spotify.service');

const stravaClientId = '75032'

const moment = require('moment');


const connectSpotifyService = async (auth0_uid, auth_token) => {

    // exchange spotify authorization token for an access + refresh token
    const reqConfig = {
        method: "POST",
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + (Buffer.from(spotifyClientId + ":" + process.env.SPOTIFY_CLIENT_SECRET).toString("base64"))
        },
        params: {
            code: auth_token,
            grant_type: "authorization_code",
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI
        }
    }

    // exchange auth_token for access + refresh tokens
    const spotifyResponse = await axios(reqConfig)

    // Parse response
    const connectionData = {
        access_token: _.get(spotifyResponse, 'data.access_token'),
        refresh_token: _.get(spotifyResponse, 'data.refresh_token')
    }

    // fetch spotify user profile with tokens
    const userProfile = await getSpotifyUserDetails(auth0_uid, connectionData);

    const userUpdate = {
        spotify_access_token: _.get(spotifyResponse, 'data.access_token'),
        spotify_refresh_token: _.get(spotifyResponse, 'data.refresh_token'),
        spotify_uid: _.get(userProfile, 'id'),
    }

    // save spotify user profile to mongodb
    await updateUserDataByIdMongo("auth0", auth0_uid, userUpdate);
}

const exchangeSpotifyRefreshToken = async (spotify_uid, refresh_token) => {

    // fetch spotify user access_token / refresh_token if expired
    const reqConfig = {
        method: "POST",
        url: "https://accounts.spotify.com/api/token",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        params: {
            grant_type: "refresh_token",
            refresh_token: refresh_token,
            client_id: spotifyClientId,
            client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        }

    }

    // exchange tokens
    const response = await axios(reqConfig)

    // console.log(`Spotify Response: ${JSON.stringify(response.data)}`)

    const userUpdate = {
        spotify_refresh_token: _.get(response, 'data.refresh_token', refresh_token),
        spotify_access_token: _.get(response, 'data.access_token'),
    }

    // console.log(`new access token: ${spotify_access_token}`)
    // console.log(`new refresh token: ${spotify_refresh_token}`)

    // save spotify user profile to mongodb
    await updateUserDataByIdMongo("spotify", spotify_uid, userUpdate);

    // return new access token
    return { access_token: userUpdate.spotify_access_token, refresh_token: userUpdate.spotify_refresh_token }
}

const sendSpotifyApiRequest = async (uid, reqConfig, tokens) => {

    if (!tokens) {
        tokens = await getUserTokensByServiceId("spotify", uid)
    }

    // console.log(`Sending Spotify API request to ${reqConfig.url}`)
    // console.log(`Spotify access token: ${tokens.access_token}`)
    // console.log(`Spotify refresh token: ${tokens.refresh_token}`)

    try {
        const response = await axios(reqConfig)
        return response
    }
    catch (error) {
        // if access token expired, try to exchange refresh token
        if (error.response.status === 401) {
            const newTokens = await exchangeSpotifyRefreshToken(uid, tokens.refresh_token)
            reqConfig.headers["authorization"] = "Bearer " + newTokens.access_token
            const response = await axios(reqConfig)
            return response
        }
        else {
            throw error
        }
    }

}

const fetchSpotifyTracks = async (uid, tokens, start_time, end_time) => {

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me/player/recently-played",
        headers: {
            "Content-Type": "application/json",
            "authorization": "Bearer " + tokens.access_token
        },
        params: {
            limit: 25,
            after: start_time,

        }
    }

    const response = await sendSpotifyApiRequest(uid, reqConfig, tokens)

    const tracksInRange = _.get(response, 'data.items', [])

    const filteredTracks = tracksInRange.filter(item => {
        const playedAtInMillis = new Date(item.played_at).getTime()
        return playedAtInMillis <= end_time
    })

    const tracks = filteredTracks.map(item => {
        return {
            name: item.track.name,
            artist: item.track.artists[0].name,
            album: item.track.album.name,
            duration: item.track.duration_ms,
            played_at: item.played_at,
            href: item.track.href,
            preview_url: item.track.preview_url,
        }
    })

    // sort tracks by oldest date first using played_at
    tracks.sort((a, b) => {
        return new Date(a.played_at) - new Date(b.played_at)
    })

    return tracks
}

const getSpotifyUserDetails = async (uid, tokens) => {

    if (!tokens) {
        tokens = await getUserTokensByServiceId("spotify", uid)
    }

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + tokens.access_token
        }
    }

    const response = await sendSpotifyApiRequest(uid, reqConfig, tokens)
    return response.data
}


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

// Store Strava Activities in MongoDb
const storeActivityInMongoDB = async (auth0_uid, activity) => {

    try {
        await client.connect();
        const database = client.db('production');
        const activities = database.collection('activities');

        // append auth0_uid to each activity
        activity.auth0_uid = auth0_uid;

        // insert activity in database
        await activities.insertOne(activity);

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
        await users.updateOne({ [key + '_uid']: _.toString(value) }, { $set: data }, { upsert: true });

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
        const result = await activities.find({ auth0_uid: auth0_uid }).sort({ start_date: -1 }).limit(1)
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
        userConfig.last_strava_activity = await minifyStravaActivity(_.get(userProfile, "last_strava_activity"))
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
        const result = await users.findOne({ [key + '_uid']: _.toString(value) });

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
        await users.updateOne({ [key + '_uid']: _.toString(value) }, { $set: data }, { upsert: false });

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
        await users.updateOne({ [key + '_uid']: _.toString(value) }, { $unset: fields }, { upsert: false });
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
        const result = await users.findOne({ [key + '_uid']: _.toString(value) });

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


async function getStravaUserProfile(strava_id) {

    const stravaTokens = await getUserTokensByServiceId("strava", strava_id)

    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${stravaTokens.access_token}`
        }
    }


    const stravaResponse = await sendStravaApiRequest(strava_id, reqConfig, stravaTokens)
    return stravaResponse.data;
}

const exchangeStravaAuthToken = async (uid, auth_token) => {

    // fetch strava user access_token / refresh_token
    const reqConfig = {
        method: "POST",
        url: "https://www.strava.com/oauth/token",
        params: {
            client_id: stravaClientId,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            code: auth_token,
            grant_type: "authorization_code"
        }
    }

    // exchange token
    const stravaResponse = await axios(reqConfig)

    // Parse response
    const userUpdate = {
        strava_access_token: stravaResponse.data.access_token,
        strava_refresh_token: stravaResponse.data.refresh_token,
        strava_uid: _.toString(stravaResponse.data.athlete.id),
    }

    // update user data in mongo
    await updateUserDataByIdMongo("auth0", uid, userUpdate)

}

const getStravaWebhookDetails = async () => {

    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/push_subscriptions",
        headers: {
            "Content-Type": "application/json",
        },
        params: {
            client_id: stravaClientId,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
        }

    }

    const response = await axios(reqConfig)
    return response.data

}

const deleteStravaWebhook = async () => {

    const details = await getStravaWebhookDetails();

    for (let subscription of details) {

        const reqConfig = {
            method: "DELETE",
            url: `https://www.strava.com/api/v3/push_subscriptions/${subscription.id}`,
            headers: {
                "Content-Type": "application/json",
            },
            params: {
                client_id: stravaClientId,
                client_secret: process.env.STRAVA_CLIENT_SECRET,
                id: subscription.id
            }

        }

        const response = await axios(reqConfig)

    }
}

const fetchStravaActivityDetails = async (uid, stravaTokens, activity_id) => {

    const reqConfig = {
        method: "GET",
        url: `https://www.strava.com/api/v3/activities/${activity_id}`,
        headers: {
            "Content-Type": "application/json",
        },
        params: {
            access_token: stravaTokens.access_token,
        }

    }

    const response = await sendStravaApiRequest(uid, reqConfig, stravaTokens)
    return response.data

}

const sendStravaApiRequest = async (strava_uid, reqConfig, tokens) => {

    if (!tokens) {
        tokens = await getUserTokensByServiceId("strava", strava_uid)
    }

    try {
        const response = await axios(reqConfig)
        return response
    }
    catch (error) {
        // if access token expired, try to exchange refresh token
        if (error.response.status === 401) {
            const newTokens = await exchangeStravaRefreshToken(strava_uid, tokens.refresh_token)
            reqConfig.headers["authorization"] = "Bearer " + newTokens.access_token
            const response = await axios(reqConfig)
            return response
        }
        else {
            throw error
        }
    }

}

const getStravaActivityTracklist = async (activity_id) => {

    // Fetch Tracklist that pairs with the strava_activity_id from mongodb
    try {
        await client.connect();
        const database = client.db('production');
        const tracklists = database.collection('tracklists');

        // Fetch the tracklist from the database
        const result = await tracklists.findOne({ strava_activity_id: activity_id });
        return result;

    }
    catch (err) {
        console.log(err.stack);
    }

}

const minifyStravaActivity = async (activity) => {

    try {
        // Get local start date time object from strava activity
        const local_start_datetime = activity.start_date_local;

        // Create formatted string for start date as DD/MM/YYYY
        const local_start_date_formatted = moment(local_start_datetime).format('DD/MM/YYYY');

        // Create formatted string for start time as H:MM AM/PM
        const local_start_time_formatted = moment(local_start_datetime).format('h:mm A');

        // convert meters to miles
        const distance_miles = activity.distance * 0.000621371;

        // limit distance in miles to 2 decimal places
        const distance_miles_rounded = distance_miles.toFixed(2);

        // fetch tracklist for this activity
        const trackListDetails = await getStravaActivityTracklist(activity.id)

        const trackList = trackListDetails.tracklist

        const activityData = {
            name: activity.name,
            unit_preference: activity.unit_preference,
            type: activity.type,
            start_date: activity.start_date,
            start_date_formatted: local_start_date_formatted,
            start_time_formatted: local_start_time_formatted,
            elapsed_time: activity.elapsed_time,
            distance_meters: activity.distance,
            distance_miles: distance_miles_rounded,
            average_speed: activity.average_speed,
            calories: activity.calories,
            track_count: _.toString(trackList.length),
            tracklist: trackList
        }

        return activityData
    }
    catch (error) {
        console.log(`error minifying strava activity: ${error}`)
        return null
    }

}

const processStravaActivityCreated = async (strava_uid, activity_id) => {

    // fetch user data
    const userData = await getUserDataByIdMongo("strava", strava_uid)

    // extract strava acess token
    const stravaTokens = {
        access_token: _.get(userData, 'strava_access_token'),
        refresh_token: _.get(userData, 'strava_refresh_token')
    }

    // extract spotify access token
    const spotifyTokens = {
        access_token: _.get(userData, 'spotify_access_token'),
        refresh_token: _.get(userData, 'spotify_refresh_token')
    }

    // extract spotify user id
    const spotify_uid = _.get(userData, 'spotify_uid');
    const auth0_uid = _.get(userData, 'auth0_uid');

    // fetch activity details
    let activity = await fetchStravaActivityDetails(strava_uid, stravaTokens, activity_id);

    // get activity start time and end time
    const startDateTimeMillis = new Date(activity.start_date).getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);

    // fetch spotify tracks within activity time range
    const trackList = await fetchSpotifyTracks(spotify_uid, spotifyTokens, startDateTimeMillis, endDateTimeMillis);

    // If there are tracks in the tracklist, prepend the description with a header
    if (trackList.length > 0) {

        // store tracklist in mongodb
        await storeTracklistInMongoDB(auth0_uid, { tracklist: trackList }, activity.id);

        // store activity in mongodb
        await storeActivityInMongoDB(auth0_uid, activity);

        // add last_strava_activity to user data
        await updateUserDataByIdMongo("strava", strava_uid, { last_strava_activity: activity })

        // parse tracklist string to append to activity description
        let newActivityDescription = '';

        // for each track in tracklist, append to description string as a minified list
        trackList.forEach((track, index) => {
            newActivityDescription += `${track.artist} - ${track.name}\n`;
        })

        // add header to tracklist 
        // newActivityDescription = '\n--------------------------\n' + newActivityDescription;

        // add footer to tracklist
        newActivityDescription += '\ntracklist by activitrax.app'

        // because there may be other webhooks in the queue, wait for the activity to be updated before continuing
        setTimeout(async () => {

            // fetch activity details again to make sure it has been updated
            activity = await fetchStravaActivityDetails(strava_uid, stravaTokens, activity_id);

            // if there was already a description, append the tracklist to the end
            if (activity.description) {
                newActivityDescription = activity.description + '\n\n' + newActivityDescription
            }

            await updateStravaActivity(strava_uid, activity_id, newActivityDescription);

            console.log(`Update: athlete: ${strava_uid}, activity ${activity_id}, ${trackList.length} tracks }`)

        }, 5000);

    }
}

const exchangeStravaRefreshToken = async (strava_uid, refresh_token) => {

    const reqConfig = {
        method: "POST",
        url: "https://www.strava.com/oauth/token",
        params: {
            client_id: stravaClientId,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: refresh_token,
            grant_type: "refresh_token"
        }
    }

    const response = await axios(reqConfig)

    // Parse response
    const new_tokens = {
        refresh_token: _.get(response, 'data.refresh_token', refresh_token),
        access_token: _.get(response, 'data.access_token')
    }

    // update user tokens in mongodb
    const userUpdate = {
        strava_access_token: new_tokens.access_token,
        strava_refresh_token: new_tokens.refresh_token
    }

    await updateUserDataByIdMongo("strava", strava_uid, userUpdate)

    // return new access token
    return new_tokens
}

const updateStravaActivity = async (user_id, activity_id, update_body) => {

    const stravaTokens = await getUserTokensByServiceId("strava", user_id)

    // update activity with spotify playlist
    const reqConfig = {
        method: "PUT",
        url: `https://www.strava.com/api/v3/activities/${activity_id}`,
        headers: {
            "Content-Type": "application/json",
            "authorization": `Bearer ${stravaTokens.access_token}`
        },
        data: {
            description: update_body
        }

    }

    const response = await sendStravaApiRequest(user_id, reqConfig, stravaTokens)
    return response.data
}

// subscribe to strava new activity webhook
const createStravaWebhook = async () => {

    const reqConfig = {
        method: "POST",
        url: "https://www.strava.com/api/v3/push_subscriptions",
        headers: {
            "Content-Type": "application/json",
        },
        params: {
            client_id: stravaClientId,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            callback_url: process.env.STRAVA_CALLBACK_URL,
            verify_token: process.env.STRAVA_WEBOHOOK_VERIFY_TOKEN
        }

    }

    const response = await axios(reqConfig)

}

const getLastStravaActivityStrava = async (strava_uid) => {

    const stravaTokens = await getUserTokensByServiceId("strava", strava_uid)
    
    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete/activities",
        headers: {
            "Content-Type": "application/json",
            "authorization": `Bearer ${stravaTokens.access_token}`
        }
    }

    const response = await sendStravaApiRequest(strava_uid, reqConfig, stravaTokens)
    return _.get(response, 'data[0]', null)

}
const reprocessLastStravaActivity = async (strava_uid) => {

    // get last strava activity from strava api for user
    const lastStravaActivity = await getLastStravaActivityStrava(strava_uid);

    if (lastStravaActivity) {
        await processStravaActivityCreated(strava_uid, lastStravaActivity.id)
    }
}


module.exports = {
    fetchStravaActivities,
    updateUserTokens,
    storeActivityInMongoDB,
    storeTracklistInMongoDB,
    fetchTracklist,
    getUserTokensByServiceId,
    getUserStravaTokens,
    getUserConfigForClient,
    getLastStravaActivity,
    getUserSpotifyTokens,
    getUserDataByIdMongo,
    updateUserDataByIdMongo,
    deleteUserConnectionData,
    setUserDataByIdMongo,
    deleteUserDataByIdMongo,
    createStravaWebhook,
    processStravaActivityCreated,
    exchangeStravaRefreshToken,
    updateStravaActivity,
    getStravaUserProfile,
    exchangeStravaAuthToken,
    minifyStravaActivity,
    connectSpotifyService,
    fetchSpotifyTracks,
    getSpotifyUserDetails,
    sendSpotifyApiRequest,
    exchangeSpotifyRefreshToken,
    reprocessLastStravaActivity
}