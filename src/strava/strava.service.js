const mongoUserDb = require("../mongodb/user.repository");
const stravaApi = require("./strava.api");
const spotifyApi = require("../spotify/spotify.api");
const mongoTracklistDb = require("../mongodb/tracklist.repository");
const mongoActivityDb = require("../mongodb/activity.repository");
const _ = require('lodash');
const logger = require('../logger');

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

    // Check if user has Spotify connected
    if (!userData?.spotify_uid || !userData?.spotify_access_token) {
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
        logger.error({ err, activity_id }, 'Spotify API error');
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.SPOTIFY_ERROR,
            processing_error: err.message || 'Unknown Spotify error'
        });
        return;
    }

    // Check if any tracks were found
    if (trackList.length === 0) {
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.NO_TRACKS
        });
        return;
    }

    // store tracklist in mongodb
    await mongoTracklistDb.saveTracklist(auth0_uid, { tracklist: trackList }, activity.id);

    // Save track count on the activity
    await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
        track_count: trackList.length
    });

    // Check if user has Strava description updates enabled (default to false)
    const stravaDescriptionEnabled = _.get(userData, 'strava_description_enabled', false);

    if (!stravaDescriptionEnabled) {
        await mongoActivityDb.updateActivity(auth0_uid, activity.id, {
            processing_status: ACTIVITY_STATUS.SUCCESS
        });
        return;
    }

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
        logger.error({ err, activity_id }, 'failed to update Strava activity description');
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

const handleActivityUpdate = async (auth0_uid, activity_id, updates) => {
    if (!updates || Object.keys(updates).length === 0) {
        return;
    }

    const activityUpdates = {};

    // Handle privacy changes
    if (updates.private !== undefined) {
        // Strava sends "true" or "false" as strings
        activityUpdates.private = updates.private === 'true';
    }

    // Handle title changes
    if (updates.title !== undefined) {
        activityUpdates.name = updates.title;
    }

    // Handle type changes
    if (updates.type !== undefined) {
        activityUpdates.type = updates.type;
    }

    // Update the activity in the database
    await mongoActivityDb.updateActivity(auth0_uid, activity_id, activityUpdates);
}

module.exports = {
    processActivity,
    reprocessLastStravaActivity,
    handleActivityUpdate,
    ACTIVITY_STATUS
};