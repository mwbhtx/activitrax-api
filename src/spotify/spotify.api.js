const mongoUserDb = require("../mongodb/user.repository.js");
const axios = require('axios')
const spotifyClientId = '2d496310f6db494791df2b41b9c2342d'
const _ = require('lodash');

const getSpotifyUserDetails = async (uid, tokens) => {
    if (!tokens) {
        tokens = await mongoUserDb.getUserTokensByServiceId("spotify", uid)
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

const exchangeSpotifyRefreshToken = async (spotify_uid, refresh_token) => {
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
            client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        }
    }

    // exchange tokens
    const response = await axios(reqConfig)

    const userUpdate = {
        spotify_refresh_token: _.get(response, 'data.refresh_token', refresh_token),
        spotify_access_token: _.get(response, 'data.access_token'),
    }

    // save spotify user profile to mongodb
    await mongoUserDb.updateUserDataByIdMongo("spotify", spotify_uid, userUpdate);

    // return new access token
    return { access_token: userUpdate.spotify_access_token, refresh_token: userUpdate.spotify_refresh_token }
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

    // sort tracks by oldest date first using played_at
    tracks.sort((a, b) => {
        return new Date(a.played_at) - new Date(b.played_at)
    })

    return tracks
}

const sendSpotifyApiRequest = async (uid, reqConfig, tokens) => {
    if (!tokens) {
        tokens = await mongoUserDb.getUserTokensByServiceId("spotify", uid)
    }

    try {
        const response = await axios(reqConfig)
        return response
    }
    catch (error) {
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

module.exports = {
    sendSpotifyApiRequest,
    getSpotifyUserDetails,
    fetchSpotifyTracks,
    exchangeSpotifyRefreshToken,
};