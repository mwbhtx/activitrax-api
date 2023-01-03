const axios = require("axios");
const { addUserConnectionData, searchAuth0UserBySpotifyId, updateUserServiceTokens } = require("../auth0/auth0.service");
const jwt_decode = require('jwt-decode');
const spotifyClientId = '2d496310f6db494791df2b41b9c2342d'
const _ = require('lodash');

const connectSpotifyService = async (user_id, auth_token) => {

    // exchange spotify authorization token for an access + refresh token
    const reqConfig = {
        method: "POST",
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + (Buffer.from(spotifyClientId + ":" + process.env.ACTIVITRAX_SPOTIFY_CLIENT_SECRET).toString("base64"))
        },
        params: {
            code: auth_token,
            grant_type: "authorization_code",
            redirect_uri: process.env.ACTIVITRAX_SPOTIFY_REDIRECT_URI
        }
    }

    // exchange auth_token for access + refresh tokens
    const spotifyResponse = await axios(reqConfig)

    // Parse response
    const connectionData = {
        spotify: {
            access_token: _.get(spotifyResponse, 'data.access_token'),
            refresh_token: _.get(spotifyResponse, 'data.refresh_token')
        }
    }

    // fetch spotify user profile with tokens
    const userProfile = await getSpotifyUserDetails(user_id, connectionData.spotify);

    // store spotify user id in connection data
    _.set(connectionData, 'spotify.id', _.get(userProfile, 'id'));

    // store user service data in auth0
    await addUserConnectionData(user_id, connectionData);

}

const exchangeSpotifyRefreshToken = async (uid, refresh_token) => {

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
            client_secret: process.env.ACTIVITRAX_SPOTIFY_CLIENT_SECRET,
        }

    }

    // exchange tokens
    const response = await axios(reqConfig)

    // Parse response
    const new_tokens = {
        refresh_token: _.get(response, 'data.refresh_token', refresh_token),
        access_token: _.get(response, 'data.access_token')
    }

    // save new refresh token / access token to auth0 user metadata
    await updateUserServiceTokens(uid, 'spotify', new_tokens)

    // return new access token
    return new_tokens

}

const sendSpotifyApiRequest = async (uid, reqConfig, tokens) => {

    if (!tokens) {
        tokens = await getSpotifyApiTokens(uid);
    }

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

    return tracks
}

const getSpotifyUserDetails = async (uid, tokens) => {

    if (!tokens) {
        tokens = await getSpotifyApiTokens(uid)
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

const getSpotifyApiTokens = async (uid) => {
    const userData = await searchAuth0UserBySpotifyId(uid);
    if (!userData) { throw new Error("User not found") }
    const response = {
        access_token: _.get(userData, 'app_metadata.connections.spotify.access_token'),
        refresh_token: _.get(userData, 'app_metadata.connections.spotify.refresh_token')
    }
    if (!response.access_token || !response.refresh_token) {
        throw new Error("User has not connected Spotify")
    }
    return response
}


module.exports = {
    getSpotifyApiTokens,
    connectSpotifyService,
    fetchSpotifyTracks,
    getSpotifyUserDetails,
}