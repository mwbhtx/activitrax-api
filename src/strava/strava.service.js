const mongoUserDb = require("../mongodb/user.repository");
const stravaApi = require("./strava.api");
const spotifyApi = require("../spotify/spotify.api");
const mongoTracklistDb = require("../mongodb/tracklist.repository");
const mongoActivityDb = require("../mongodb/activity.repository");
const moment = require('moment');
const _ = require('lodash');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Activity processing status constants
const ACTIVITY_STATUS = {
    PROCESSING: 'processing',
    SUCCESS: 'success',
    NO_SPOTIFY: 'no_spotify',
    SPOTIFY_ERROR: 'spotify_error',
    NO_TRACKS: 'no_tracks',
    STRAVA_UPDATE_ERROR: 'strava_update_error'
};

const processActivity = async (strava_uid, activity_id) => {
    // fetch user data
    const userData = await mongoUserDb.getUser("strava", strava_uid);
    const auth0_uid = _.get(userData, 'auth0_uid');

    // extract strava access token
    const stravaTokens = {
        access_token: _.get(userData, 'strava_access_token'),
        refresh_token: _.get(userData, 'strava_refresh_token')
    };

    // fetch activity details from Strava
    let activity = await stravaApi.getActivity(strava_uid, stravaTokens, activity_id);

    // Save activity immediately with processing status
    activity.processing_status = ACTIVITY_STATUS.PROCESSING;
    await mongoActivityDb.saveActivity(auth0_uid, activity);

    // add last_strava_activity to user data
    await mongoUserDb.saveUser("strava", strava_uid, { last_strava_activity: activity });

    // Check if user has Spotify connected
    if (!userData?.spotify_uid || !userData?.spotify_access_token) {
        console.log(`Activity ${activity_id}: user ${strava_uid} has no Spotify connected`);
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.NO_SPOTIFY
        });
        return;
    }

    // extract spotify access token
    const spotifyTokens = {
        access_token: _.get(userData, 'spotify_access_token'),
        refresh_token: _.get(userData, 'spotify_refresh_token')
    };
    const spotify_uid = _.get(userData, 'spotify_uid');

    // get activity start time and end time
    const startDateTimeMillis = new Date(activity.start_date).getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);

    // fetch spotify tracks within activity time range
    let trackList;
    try {
        trackList = await spotifyApi.getTracklist(spotify_uid, spotifyTokens, startDateTimeMillis, endDateTimeMillis);
    } catch (err) {
        console.error(`Activity ${activity_id}: Spotify API error:`, err);
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.SPOTIFY_ERROR,
            processing_error: err.message || 'Unknown Spotify error'
        });
        return;
    }

    // Check if any tracks were found
    if (trackList.length === 0) {
        console.log(`Activity ${activity_id}: no Spotify tracks found in time range`);
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.NO_TRACKS
        });
        return;
    }

    // store tracklist in mongodb
    await mongoTracklistDb.saveTracklist(auth0_uid, { tracklist: trackList }, activity.id);

    // parse tracklist string to append to activity description
    let newActivityDescription = '';
    trackList.forEach((track) => {
        newActivityDescription += `${track.artist} - ${track.name}\n`;
    });
    newActivityDescription += '\ntracklist by activitrax.app';

    // Wait for other webhook listeners to finish updating the activity
    await delay(5000);

    try {
        // fetch activity details again to get any description added by user or other apps
        activity = await stravaApi.getActivity(strava_uid, stravaTokens, activity_id);

        // if there was already a description, append the tracklist to the end
        if (activity.description) {
            newActivityDescription = activity.description + '\n\n' + newActivityDescription;
        }

        await stravaApi.saveActivity(strava_uid, activity_id, newActivityDescription);

        // Mark as successful
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.SUCCESS
        });
    } catch (err) {
        console.error('Failed to update Strava activity description:', err);
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.STRAVA_UPDATE_ERROR,
            processing_error: err.message || 'Unknown Strava error'
        });
    }
}

const reprocessLastStravaActivity = async (strava_uid) => {
    const lastStravaActivity = await stravaApi.getLastActivity(strava_uid);

    if (lastStravaActivity) {
        await processActivity(strava_uid, lastStravaActivity.id)
    }
}

const minifyActivityDetails = async (activity) => {
    try {
        // Get local start date time object from strava activity
        const local_start_datetime = activity.start_date_local;

        // Create formatted string for start date as DD/MM/YYYY
        const local_start_date_formatted = moment(local_start_datetime).format('DD/MM/YYYY');

        // Create formatted string for start time as H:MM AM/PM
        const local_start_time_formatted = moment(local_start_datetime).format('h:mm A');

        // convert meters to miles
        const distance_miles = activity.distance * 0.000621371;

        // limit distance in miles to 2 decimal places
        const distance_miles_rounded = distance_miles.toFixed(2);

        // fetch tracklist for this activity
        const trackListDetails = await mongoTracklistDb.getTracklist(activity.id)

        const trackList = trackListDetails.tracklist

        const activityData = {
            name: activity.name,
            unit_preference: activity.unit_preference,
            type: activity.type,
            start_date: activity.start_date,
            start_date_formatted: local_start_date_formatted,
            start_time_formatted: local_start_time_formatted,
            elapsed_time: activity.elapsed_time,
            distance_meters: activity.distance,
            distance_miles: distance_miles_rounded,
            average_speed: activity.average_speed,
            calories: activity.calories,
            track_count: _.toString(trackList.length),
            tracklist: trackList
        }

        return activityData
    }
    catch (error) {
        console.log(`error minifying strava activity: ${error}`)
        return null
    }
}

module.exports = {
    processActivity,
    reprocessLastStravaActivity,
    minifyActivityDetails,
    ACTIVITY_STATUS
};