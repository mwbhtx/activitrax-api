const axios = require('axios')
const { getUserConfig, getUserData, getAppMetaData, setUserConnectionData, addUserConnectionData, searchAuth0UserByQuery, searchAuth0UserByStravaId } = require("../auth0/auth0.service");
const { fetchSpotifyTracks } = require('../spotify/spotify.service');

const getStravaApiToken = async (uid) => {
    const userData = await searchAuth0UserByStravaId(uid);
    const refreshToken = userData.app_metadata.connections.strava.refresh_token;
    const new_access_token = await exchangeRefreshTokenForAccessToken(refreshToken)
    return new_access_token
}

const exchangeStravaAuthToken = async (uid, auth_token) => {

    // fetch strava user access_token / refresh_token
    const reqConfig = {
        method: "POST",
        url: "https://www.strava.com/oauth/token",
        params: {
            client_id: process.env.ACTIVITRAX_STRAVA_CLIENT_ID,
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
            client_id: process.env.ACTIVITRAX_STRAVA_CLIENT_ID,
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
                client_id: process.env.ACTIVITRAX_STRAVA_CLIENT_ID,
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

    // fetch activity details
    const userData = await searchAuth0UserByQuery(`app_metadata.connections.strava.id:${user_id}`);
    const stravaToken = userData.app_metadata.connections.strava.access_token;
    const spotifyToken = userData.app_metadata.connections.spotify.refresh_token;
    // const stravaApiToken = user_data.connections.strava.access_token;
    const activity = await fetchStravaActivityDetails(stravaToken, activity_id);
    const startdatetime = new Date(activity.start_date);
    const startDateTimeMillis = startdatetime.getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);
    const trackList = await fetchSpotifyTracks(spotifyToken, startDateTimeMillis, endDateTimeMillis);
    console.log(activity)
    let updatedDescriptionString = 'Playlist: \n';

    trackList.forEach( (track, index) => {
        updatedDescriptionString += `${index+1}. ${track.artist} - ${track.name} \n`;
    })

    const currentDescription = activity.description;

    const appendedDescription = currentDescription + '\n\n' + updatedDescriptionString;

    await updateStravaActivity(user_id, activity_id, appendedDescription);
}

const exchangeRefreshTokenForAccessToken = async (refresh_token) => {

    const reqConfig = {
        method: "POST",
        url: "https://www.strava.com/oauth/token",
        params: {
            client_id: process.env.ACTIVITRAX_STRAVA_CLIENT_ID,
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
            client_id: process.env.ACTIVITRAX_STRAVA_CLIENT_ID,
            client_secret: process.env.ACTIVITRAX_STRAVA_CLIENT_SECRET,
            callback_url: process.env.ACTIVITRAX_STRAVA_WEBOHOOK_CALLBACK_URL,
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
    getStravaApiToken
}