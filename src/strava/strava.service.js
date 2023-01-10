const axios = require('axios')
const { fetchSpotifyTracks } = require('../spotify/spotify.service');
const stravaClientId = '75032'

const _ = require('lodash');
const moment = require('moment');
const { storeTracklistInMongoDB, storeActivityInMongoDB, updateUserDataByIdMongo, getUserTokensByServiceId, getUserDataByIdMongo } = require('../mongo/mongoservice');


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
            client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
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
            client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
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
                client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
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

const minifyStravaActivity = (activity) => {

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

        const activityData = {
            id: activity.id,
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

    console.log(`user data: ${JSON.stringify(userData, null, 2)}`)

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
        await storeTracklistInMongoDB(auth0_uid, tracklist, activity.id);

        // store activity in mongodb
        await storeActivityInMongoDB(auth0_uid, activity);

        // add last_strava_activity to user data
        await updateUserDataByIdMongo("strava", strava_uid, { last_strava_activity: activity })

        // parse tracklist string to append to activity description
        let newActivityDescription = '';

        // for each track in tracklist, append to description string as a minified list
        trackList.forEach((track, index) => {
            newActivityDescription += `- ${track.artist} - ${track.name}\n`;
        })

        // add header to tracklist 
        newActivityDescription = 'soundtrack:\n --------------------------\n' + newActivityDescription;

        // add footer to tracklist
        newActivityDescription += '--------------------------\n- provided by activitrax.io'

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
            client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
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
            client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
            callback_url: process.env.ACTIVITRAX_STRAVA_CALLBACK_URL,
            verify_token: process.env.ACTIVITRAX_STRAVA_WEBOHOOK_VERIFY_TOKEN
        }

    }

    const response = await axios(reqConfig)

}




module.exports = {
    exchangeStravaAuthToken,
    createStravaWebhook,
    deleteStravaWebhook,
    getStravaWebhookDetails,
    processStravaActivityCreated,
    getStravaUserProfile,
    minifyStravaActivity
}