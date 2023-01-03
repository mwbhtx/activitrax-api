const axios = require("axios");
const { addUserConnectionData, searchAuth0UserBySpotifyId, updateUserConnectionData } = require("../auth0/auth0.service");
const jwt_decode = require('jwt-decode');
const spotifyClientId = '2d496310f6db494791df2b41b9c2342d'
const _ = require('lodash');

const getSpotifyUserProfile = async (auth0_token, spotify_uid) => {
    
    const spotify_access_token = await getSpotifyApiToken(spotify_uid);

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + spotify_access_token
        }
    }

    const spotifyResponse = await axios(reqConfig)
    return spotifyResponse.data;

}

const connectSpotifyService = async (user_id, auth_token) => {

    // fetch spotify user access_token / refresh_token
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

    // exchange token
    const spotifyResponse = await axios(reqConfig)

    // Parse response
    const connectionData = {
        spotify: {
            access_token: spotifyResponse.data.access_token,
            refresh_token: spotifyResponse.data.refresh_token
        }
    }

    const userProfile = await getSpotifyUserDetails(connectionData.spotify.access_token);
    connectionData.spotify.id = userProfile.id;

    // store user service data in auth0
    await addUserConnectionData(user_id, connectionData);

}

const exchangeRefreshTokenForAccessToken = async (refresh_token) => {

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

    const response = await axios(reqConfig)

    // save new refresh token & access token
    const new_refresh_token = response.data.refresh_token
    const new_access_token = response.data.access_token

    await updateUserConnectionDataa(user_id, {
        spotify: {
            access_token: new_access_token,
            refresh_token: new_refresh_token
        }
    })

}

const fetchSpotifyTracks = async (spotify_access_token, start_time, end_time) => {

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me/player/recently-played",
        headers: {
            "Content-Type": "application/json",
            "authorization": "Bearer " + spotify_access_token
        },
        params: {
            limit: 25,
            after: start_time,
            
        }
    }

    const response = await axios(reqConfig)

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

const getSpotifyUserDetails = async (access_token) => {

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + access_token
        }
    }

    const response = await axios(reqConfig)
    return response.data
}

const getSpotifyApiToken = async (uid) => {
    const userData = await searchAuth0UserBySpotifyId(uid);
    return userData.app_metadata.connections.spotify.access_token;
}


module.exports = {
    getSpotifyApiToken,
    connectSpotifyService,
    fetchSpotifyTracks,
    getSpotifyUserDetails,
    getSpotifyUserProfile
}