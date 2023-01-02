const axios = require("axios");
const { addUserConnectionData, searchAuth0UserBySpotifyId } = require("../auth0/auth0.service");

const connectSpotifyService = async (user_id, auth_token) => {

    // fetch spotify user access_token / refresh_token
    const reqConfig = {
        method: "POST",
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + (Buffer.from(process.env.ACTIVITRAX_SPOTIFY_CLIENT_ID + ":" + process.env.ACTIVITRAX_SPOTIFY_CLIENT_SECRET).toString("base64"))
        },
        params: {
            code: auth_token,
            grant_type: "authorization_code",
            redirect_uri: "http://localhost:3000/spotify_auth"
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

    const reqConfig = {
        method: "POST",
        url: "https://accounts.spotify.com/api/token",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        params: {
            grant_type: "refresh_token",
            refresh_token: refresh_token,
            client_id: process.env.ACTIVITRAX_SPOTIFY_CLIENT_ID,
            client_secret: process.env.ACTIVITRAX_SPOTIFY_CLIENT_SECRET,
        }

    }

    const response = await axios(reqConfig)
    return response.data.access_token

}

const fetchSpotifyTracks = async (refresh_token, start_time, end_time) => {

    const access_token = await exchangeRefreshTokenForAccessToken(refresh_token);

    end_time = 1672651099389

    const reqConfig = {
        method: "GET",
        url: "https://api.spotify.com/v1/me/player/recently-played",
        headers: {
            "Content-Type": "application/json",
            "authorization": "Bearer " + access_token
        },
        params: {
            limit: 25,
            after: start_time
        }
    }

    const response = await axios(reqConfig)

    const filteredTracks = response.data.items.filter(item => {
        const playedAtInMillis = new Date(item.played_at).getTime()
        return playedAtInMillis < end_time
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

    console.log(tracks)

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
    const refresh_token = userData.app_metadata.connections.spotify.refresh_token;
    const new_access_token = await exchangeRefreshTokenForAccessToken(refresh_token);
    return new_access_token;
}


module.exports = { 
    getSpotifyApiToken,
    connectSpotifyService,
    fetchSpotifyTracks,
    getSpotifyUserDetails
}