const axios = require('axios')
const { addUserConnectionData, searchAuth0UserByQuery, searchAuth0UserByStravaId, updateUserServiceTokens, addUserActivityData } = require("../auth0/auth0.service");
const { fetchSpotifyTracks } = require('../spotify/spotify.service');
const stravaClientId = '75032'

const _ = require('lodash');
const { join } = require('lodash');


const getStravaApiToken = async (uid) => {
    const userData = await searchAuth0UserByStravaId(uid);
    if (!userData) { throw new Error("User not found") }
    const response = {
        access_token: _.get(userData, 'app_metadata.connections.strava.access_token'),
        refresh_token: _.get(userData, 'app_metadata.connections.strava.refresh_token')
    }
    if (!response.access_token || !response.refresh_token) {
        throw new Error("User has not connected Strava")
    }
    return response
}


async function getStravaUserProfile(auth0_token, strava_id) {

    const stravaTokens = await getStravaApiToken(strava_id);

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
    const serviceData = {
        strava: {
            access_token: stravaResponse.data.access_token,
            refresh_token: stravaResponse.data.refresh_token,
            id: stravaResponse.data.athlete.id,
        }
    }

    // store user service data in auth0
    await addUserConnectionData(uid, serviceData);

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

const sendStravaApiRequest = async (uid, reqConfig, tokens) => {

    if (!tokens) {
        tokens = await getStravaApiToken(uid);
    }

    try {
        const response = await axios(reqConfig)
        return response
    }
    catch (error) {
        // if access token expired, try to exchange refresh token
        if (error.response.status === 401) {
            const newTokens = await exchangeStravaRefreshToken(uid, tokens.refresh_token)
            reqConfig.headers["authorization"] = "Bearer " + newTokens.access_token
            const response = await axios(reqConfig)
            return response
        }
        else {
            throw error
        }
    }

}

const processStravaActivityCreated = async (user_id, activity_id) => {

    // fetch auth0 user data to get access tokens
    const userData = await searchAuth0UserByQuery(`app_metadata.connections.strava.id:${user_id}`);

    // extract strava acess token
    const stravaTokens = {
        access_token: _.get(userData, 'app_metadata.connections.strava.access_token'),
        refresh_token: _.get(userData, 'app_metadata.connections.strava.refresh_token'),
    }

    // extract spotify access token
    const spotifyTokens = {
        access_token: _.get(userData, 'app_metadata.connections.spotify.access_token'),
        refresh_token: _.get(userData, 'app_metadata.connections.spotify.refresh_token'),
    }

    // extract spotify user id
    const spotify_id = _.get(userData, 'app_metadata.connections.spotify.id');

    // fetch activity details
    let activity = await fetchStravaActivityDetails(user_id, stravaTokens, activity_id);

    // get activity start time and end time
    const startDateTimeMillis = new Date(activity.start_date).getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);

    // fetch spotify tracks within activity time range
    const trackList = await fetchSpotifyTracks(spotify_id, spotifyTokens, startDateTimeMillis, endDateTimeMillis);

    // parse tracklist string to append to activity description
    let tracklistString = '';

    // for each track in tracklist, append to description string as a minified list
    trackList.forEach((track, index) => {
        tracklistString += `- ${track.artist} - ${track.name}\n`;
    })

    // Parse data from strava activity and store in user_metadata

    // Get local start date time object from strava activity
    const local_start_datetime = activity.start_date_local;

    // Create formatted string for start date as DD/MM/YYYY
    const local_start_date_formatted = moment(local_start_datetime).format('DD/MM/YYYY');

    // Create formatted string for start time as HH:MM AM/PM
    const local_start_time_formatted = moment(local_start_datetime).format('hh:mm A');

    const activityData = {
        id: activity.id,
        name: activity.name,
        type: activity.type,
        start_date: activity.start_date,
        start_date_formatted: local_start_date_formatted,
        start_time_formatted: local_start_time_formatted,
        elapsed_time: activity.elapsed_time,
        distance: activity.distance,
        average_speed: activity.average_speed,
        calories: activity.calories,
        track_count: trackList.length,
        tracklist: trackList
    }

    // get auth0 user id
    const auth0UserId = userData.user_id;

    // store activity data in auth0
    await addUserActivityData(auth0UserId, activityData);

    // If there are tracks in the tracklist, prepend the description with a header
    if (tracklistString.length > 0) {

        // add header to tracklist 
        tracklistString = 'tracklist:\n --------------------------\n' + tracklistString;

        // init new description body
        let updatedDescriptionBody = tracklistString;

        // because there may be other webhooks in the queue, wait for the activity to be updated before continuing
        setTimeout(async () => {
            // fetch activity details again to make sure it has been updated
            activity = await fetchStravaActivityDetails(user_id, stravaTokens, activity_id);

            // if there was already a description, append the tracklist to the end
            if (activity.description) {
                updatedDescriptionBody = activity.description + '\n\n' + tracklistString
            }

            // add company info
            updatedDescriptionBody += '--------------------------\n- provided by activitrax.io'

            await updateStravaActivity(user_id, activity_id, updatedDescriptionBody);
            console.log(`Update: athlete: ${user_id}, activity ${activity_id}, ${trackList.length} tracks }`)

        }, 5000);

    }
}

const exchangeStravaRefreshToken = async (uid, refresh_token) => {

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

    // save new refresh token / access token to auth0 user metadata
    await updateUserServiceTokens(uid, 'strava', new_tokens)

    // return new access token
    return new_tokens
}

const updateStravaActivity = async (user_id, activity_id, update_body) => {

    const stravaTokens = await getStravaApiToken(user_id);

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
    getStravaApiToken,
    getStravaUserProfile
}