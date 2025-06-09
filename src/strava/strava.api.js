const mongoUserDb = require("../mongodb/user.repository");
const axios = require("axios");
const stravaClientId = '75032'
const _ = require('lodash');

async function getUser(strava_id) {
    const stravaTokens = await mongoUserDb.getUserTokensByService("strava", strava_id)
    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${stravaTokens.access_token}`
        }
    }

    const stravaResponse = await sendApiRequest(strava_id, reqConfig, stravaTokens)
    return stravaResponse.data;
}

const sendApiRequest = async (strava_uid, reqConfig, tokens) => {
    if (!tokens) {
        tokens = await mongoUserDb.getUserTokensByService("strava", strava_uid)
    }

    try {
        const response = await axios(reqConfig)
        return response
    }
    catch (error) {
        // if access token expired, try to exchange refresh token
        if (error.response.status === 401) {
            const newTokens = await exchangeRefreshToken(strava_uid, tokens.refresh_token)
            reqConfig.headers["authorization"] = "Bearer " + newTokens.access_token
            const response = await axios(reqConfig)
            return response
        }
        else {
            throw error
        }
    }
}

const getLastActivity = async (strava_uid) => {
    const stravaTokens = await mongoUserDb.getUserTokensByService("strava", strava_uid)
    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete/activities",
        headers: {
            "Content-Type": "application/json",
            "authorization": `Bearer ${stravaTokens.access_token}`
        }
    }

    const response = await sendApiRequest(strava_uid, reqConfig, stravaTokens)
    return _.get(response, 'data[0]', null)
}

const saveActivity = async (user_id, activity_id, update_body) => {
    const stravaTokens = await mongoUserDb.getUserTokensByService("strava", user_id)

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

    const response = await sendApiRequest(user_id, reqConfig, stravaTokens)
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
    await axios(reqConfig)
}

const exchangeAuthToken = async (uid, auth_token) => {
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
    await mongoUserDb.saveUser("auth0", uid, userUpdate)
}

const deleteWebhook = async () => {
    const details = await getWebhook();
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
        await axios(reqConfig)
    }
}

const getWebhook = async () => {
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

const getActivities = async (uid, stravaTokens, page = 1, per_page = 30) => {
    const reqConfig = {
        method: "GET",
        url: "https://www.strava.com/api/v3/athlete/activities",
        headers: {
            "Content-Type": "application/json",
            "authorization": `Bearer ${stravaTokens.access_token}`
        },
        params: {
            page: page,
            per_page: per_page
        }
    }

    const response = await sendApiRequest(uid, reqConfig, stravaTokens)
    return response.data
}

const getActivity = async (uid, stravaTokens, activity_id) => {
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

    const response = await sendApiRequest(uid, reqConfig, stravaTokens)
    return response.data
}

const exchangeRefreshToken = async (strava_uid, refresh_token) => {
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

    await mongoUserDb.saveUser("strava", strava_uid, userUpdate)

    // return new access token
    return new_tokens
}

module.exports = {
    getUser,
    getActivity,
    saveActivity,
    getWebhook,
    createStravaWebhook,
    deleteWebhook,
    exchangeAuthToken,
    getLastActivity,
    getActivities
};