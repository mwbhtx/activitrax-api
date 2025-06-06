const axios = require('axios');
const auth0ApiUrl = 'https://dev-lpah3aos.us.auth0.com/api/v2';
const auth0TokenExchangeUrl = 'https://dev-lpah3aos.us.auth0.com/oauth/token'
const m2mClientId = process.env.AUTH0_M2M_CLIENT_ID;

const _ = require('lodash');

const getAuth0ManagementToken = async () => {
    const auth0ManagementRequestOptions = {
        method: 'POST',
        url: auth0TokenExchangeUrl,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: m2mClientId,
            client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
            audience: process.env.AUTH0_AUDIENCE
        })
    };

    const response = await axios.request(auth0ManagementRequestOptions)
    const auth0_management_token = response.data.access_token;
    return auth0_management_token;
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

const getUserDataAuth0 = async (uid) => {
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

module.exports = {
    getUserDataAuth0,
    getAppMetaData,
    searchAuth0UserByQuery,
    getUserMetaData,
};