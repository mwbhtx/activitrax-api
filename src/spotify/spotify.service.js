const _ = require('lodash');
const axios = require('axios');
const spotifyApi = require("./spotify.api.js");
const mongoUserDb = require("../mongodb/user.repository.js");

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
    const userProfile = await spotifyApi.getSpotifyUserDetails(auth0_uid, connectionData);

    const userUpdate = {
        spotify_access_token: _.get(spotifyResponse, 'data.access_token'),
        spotify_refresh_token: _.get(spotifyResponse, 'data.refresh_token'),
        spotify_uid: _.get(userProfile, 'id'),
    }

    // save spotify user profile to mongodb
    await mongoUserDb.updateUserDataByIdMongo("auth0", auth0_uid, userUpdate);
}

module.exports = {
    connectSpotifyService
}