const axios = require('axios');

const auth0ApiUrl = 'https://dev-lpah3aos.us.auth0.com/api/v2';
const auth0TokenExchangeUrl = 'https://dev-lpah3aos.us.auth0.com/oauth/token'
const m2mClientId = 'J4p3DGQHQmcsrKgznHeKFDMM2DR0aLcN'

const _ = require('lodash');

const getAuth0ManagementToken = async () => {

    const auth0ManagementRequestOptions = {
        method: 'POST',
        url: auth0TokenExchangeUrl,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: m2mClientId,
            client_secret: process.env.ACTIVITRAX_M2M_CLIENT_SECRET,
            audience: 'https://dev-lpah3aos.us.auth0.com/api/v2/'
        })
    };

    const response = await axios.request(auth0ManagementRequestOptions)
    const auth0_management_token = response.data.access_token;
    return auth0_management_token;
}

const addUserActivityData = async (uid, activity) => {

    const auth0_management_token = await getAuth0ManagementToken();

    const setUserProfileRequestOptions = {
        method: 'PATCH',
        url: auth0ApiUrl + `/users/${uid}`,
        headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + auth0_management_token,
        },
        data: {
            user_metadata: {
                last_strava_activity: activity
            }
        }
    }

    await axios.request(setUserProfileRequestOptions)

}

const getUserConfigForClient = async (uid) => {

    const userProfile = await getUserData(uid);

    const userConfig = {
        connections: {}
    }

    const userConnections = _.get(userProfile, 'app_metadata.connections');
    if (userConnections) {
        for (let key of Object.keys(userConnections)) {
            userConfig.connections[key] = true
        }
    }

    const last_strava_activity = _.get(userProfile, 'user_metadata.last_strava_activity');
    if (last_strava_activity) {
        userConfig.last_strava_activity = last_strava_activity;
    }


    return userConfig;
}

const searchAuth0UserByQuery = async (query) => {

    const auth0_management_token = await getAuth0ManagementToken();

    const searchUserRequestOptions = {
        method: 'GET',
        url: auth0ApiUrl + '/users',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'authorization': 'Bearer ' + auth0_management_token,
        },
        params: {
            q: query
        }
    }

    const response = await axios.request(searchUserRequestOptions)
    if (response.data.length === 1) {
        return response.data[0];
    }
}


const updateUserServiceTokens = async (uid, service, tokens) => {

    const auth0_management_token = await getAuth0ManagementToken();
    let auth0UserId = null
    let userData = null;

    if (service === 'spotify') {
        userData = await searchAuth0UserBySpotifyId(uid);
        auth0UserId = userData.user_id;
        if (!auth0UserId) {
            throw new Error('User not found when exchanging spotify refresh token')
        } else {
            _.set(userData, 'app_metadata.connections.spotify.refresh_token', tokens.refresh_token);
            _.set(userData, 'app_metadata.connections.spotify.access_token', tokens.access_token);
        }
    } else if (service === 'strava') {
        userData = await searchAuth0UserByStravaId(uid);
        auth0UserId = userData.user_id;
        if (!auth0UserId) {
            throw new Error('User not found when exchanging strava refresh token')
        } else {
            _.set(userData, 'app_metadata.connections.strava.refresh_token', tokens.refresh_token);
            _.set(userData, 'app_metadata.connections.strava.access_token', tokens.access_token);
        }
    }

    // save user data back
    if (userData && auth0UserId) {
        const setUserProfileRequestOptions = {
            method: 'PATCH',
            url: auth0ApiUrl + `/users/${auth0UserId}`,
            headers: {
                'content-type': 'application/json',
                'authorization': 'Bearer ' + auth0_management_token,
            },
            data: {
                app_metadata: userData.app_metadata
            }
        }

        await axios.request(setUserProfileRequestOptions)

    }

}

const searchAuth0UserBySpotifyId = async (spotifyId) => {
    const user = await searchAuth0UserByQuery(`app_metadata.connections.spotify.id:${spotifyId}`);
    return user;
}

const searchAuth0UserByStravaId = async (stravaId) => {
    const user = await searchAuth0UserByQuery(`app_metadata.connections.strava.id:${stravaId}`);
    return user;
}

const getUserData = async (uid) => {

    const auth0_management_token = await getAuth0ManagementToken();

    const userProfileRequestOptions = {
        method: 'GET',
        url: auth0ApiUrl + `/users/${uid}`,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'authorization': 'Bearer ' + auth0_management_token,
        },
    }

    const auth0Response = await axios.request(userProfileRequestOptions)
    return auth0Response.data;
}

const getAppMetaData = async (uid) => {

    const auth0_management_token = await getAuth0ManagementToken();
    // Get current user data
    const getUserProfileRequstOptions = {
        method: 'GET',
        url: auth0ApiUrl + `/users/${uid}`,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Bearer ' + auth0_management_token,
        },
        params: {
            fields: 'app_metadata'
        }
    }

    const userMetaDataResponse = await axios.request(getUserProfileRequstOptions)
    return userMetaDataResponse.data.app_metadata;
}

const setUserConnectionData = async (uid, connectionData) => {

    const auth0_management_token = await getAuth0ManagementToken();

    // save user data back
    const setUserProfileRequestOptions = {
        method: 'PATCH',
        url: auth0ApiUrl + `/users/${uid}`,
        headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + auth0_management_token,
        },
        data: {
            app_metadata: {
                connections: connectionData
            }
        }
    }

    const auth0Response = await axios.request(setUserProfileRequestOptions)
    return auth0Response;

}


const addUserConnectionData = async (uid, connectionData) => {

    const userAppMetadata = await getAppMetaData(uid);

    const userConnectionObject = _.get(userAppMetadata, 'connections', {})

    // merge new connection data with existing
    const connectionsData = Object.assign(userConnectionObject, connectionData);

    await setUserConnectionData(uid, connectionsData);

}

const getUserMetaData = async (uid) => {

    const auth0_management_token = await getAuth0ManagementToken();

    const getUserProfileRequstOptions = {
        method: 'GET',
        url: auth0ApiUrl + `/users/${uid}`,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Bearer ' + auth0_management_token,
        },
        params: {
            fields: 'app_metadata'
        }
    }

    const userMetaDataResponse = await axios.request(getUserProfileRequstOptions)
    return userMetaDataResponse.data.app_metadata;
}

const deleteUserConnectionData = async (uid, connection) => {

    const userData = await getAppMetaData(uid);
    delete userData.connections[connection];
    await setUserConnectionData(uid, userData.connections);

}


module.exports = {
    addUserActivityData,
    getUserConfigForClient,
    setUserConnectionData,
    getUserData,
    getAppMetaData,
    deleteUserConnectionData,
    addUserConnectionData,
    searchAuth0UserByStravaId,
    searchAuth0UserBySpotifyId,
    searchAuth0UserByQuery,
    updateUserServiceTokens,
    getUserMetaData,
};