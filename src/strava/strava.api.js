const mongoUserDb = require("../mongodb/user.repository.js");
const axios = require("axios");
const stravaClientId = '75032'
const _ = require('lodash');

async function getStravaUserProfile(strava_id) {
    const stravaTokens = await mongoUserDb.getUserTokensByServiceId("strava", strava_id)
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

const sendStravaApiRequest = async (strava_uid, reqConfig, tokens) => {
    if (!tokens) {
        tokens = await mongoUserDb.getUserTokensByServiceId("strava", strava_uid)
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

const getLastStravaActivityStrava = async (strava_uid) => {
    const stravaTokens = await mongoUserDb.getUserTokensByServiceId("strava", strava_uid)
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

const updateStravaActivity = async (user_id, activity_id, update_body) => {
    const stravaTokens = await mongoUserDb.getUserTokensByServiceId("strava", user_id)

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
    await mongoUserDb.updateUserDataByIdMongo("auth0", uid, userUpdate)
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

    await mongoUserDb.updateUserDataByIdMongo("strava", strava_uid, userUpdate)

    // return new access token
    return new_tokens
}

module.exports = {
    getStravaUserProfile,
    fetchStravaActivityDetails,
    updateStravaActivity,
    getStravaWebhookDetails,
    createStravaWebhook,
    deleteStravaWebhook,
    exchangeStravaAuthToken,
    getLastStravaActivityStrava
};