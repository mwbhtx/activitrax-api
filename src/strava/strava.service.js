const axios = require('axios')
const { getUserConfig, getUserData, getAppMetaData, setUserConnectionData, addUserConnectionData, searchAuth0UserByQuery, searchAuth0UserByStravaId } = require("../auth0/auth0.service");
const { fetchSpotifyTracks } = require('../spotify/spotify.service');
const jwt_decode = require('jwt-decode');
const stravaClientId = '75032'

const getStravaApiToken = async (uid) => {
    const userData = await searchAuth0UserByStravaId(uid);
    return userData.app_metadata.connections.strava.access_token;
}

async function getStravaUserProfile(auth0_token, strava_id) {

    const stravaApiToken = await getStravaApiToken(strava_id);

    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${stravaApiToken}`
        }
    }

    const stravaResponse = await axios(reqConfig)
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

const fetchStravaActivityDetails = async (strava_api_token, activity_id) => {

    const reqConfig = {
        method: "GET",
        url: `https://www.strava.com/api/v3/activities/${activity_id}`,
        headers: {
            "Content-Type": "application/json",
        },
        params: {
            access_token: strava_api_token,
        }

    }

    const response = await axios(reqConfig)
    return response.data

}

const processStravaActivityCreated = async (user_id, activity_id) => {

    // fetch auth0 user data to get access tokens
    const userData = await searchAuth0UserByQuery(`app_metadata.connections.strava.id:${user_id}`);

    // extract strava acess token
    const stravaToken = userData.app_metadata.connections.strava.access_token;

    // extract spotify access token
    const spotifyToken = userData.app_metadata.connections.spotify.access_token;

    // fetch activity details
    const activity = await fetchStravaActivityDetails(stravaToken, activity_id);

    // get activity start time and end time
    const startDateTimeMillis = new Date(activity.start_date).getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);

    // fetch spotify tracks within activity time range
    const trackList = await fetchSpotifyTracks(spotifyToken, startDateTimeMillis, endDateTimeMillis);

    // parse tracklist string to append to activity description
    let tracklistString = '';

    // for each track in tracklist, append to description string as minified list
    trackList.forEach((track, index) => {
        tracklistString += `${index + 1}. ${track.artist} - ${track.name} \n`;
    })

    // If there are tracks in the tracklist, prepend the description with a header
    if (tracklistString.length > 0) {
        const updatedDescriptionBody = activity.description + '\n\n' + 'Playlist: \n' + tracklistString;
        await updateStravaActivity(user_id, activity_id, updatedDescriptionBody);
        console.log(`Update: athlete: ${user_id}, activity ${activity_id}, ${trackList.length} tracks }`)
    }

}

const exchangeRefreshTokenForAccessToken = async (refresh_token) => {

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
    return response.data.access_token
}


const updateStravaActivity = async (user_id, activity_id, update_body) => {

    const stravaApiToken = await getStravaApiToken(user_id);

    // update activity with spotify playlist
    const reqConfig = {
        method: "PUT",
        url: `https://www.strava.com/api/v3/activities/${activity_id}`,
        headers: {
            "Content-Type": "application/json",
            "authorization": `Bearer ${stravaApiToken}`
        },
        data: {
            description: update_body
        }

    }

    const response = await axios(reqConfig)
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