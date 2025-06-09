const mongoUserDb = require("../mongodb/user.repository");
const stravaApi = require("./strava.api");
const spotifyApi = require("../spotify/spotify.api");
const mongoTracklistDb = require("../mongodb/tracklist.repository");
const mongoActivityDb = require("../mongodb/activity.repository");
const moment = require('moment');
const _ = require('lodash');

const processActivity = async (strava_uid, activity_id) => {
    // fetch user data
    const userData = await mongoUserDb.getUser("strava", strava_uid)

    // extract strava acess token
    const stravaTokens = {
        access_token: _.get(userData, 'strava_access_token'),
        refresh_token: _.get(userData, 'strava_refresh_token')
    }

    // extract spotify access token
    const spotifyTokens = {
        access_token: _.get(userData, 'spotify_access_token'),
        refresh_token: _.get(userData, 'spotify_refresh_token')
    }

    // extract spotify user id
    const spotify_uid = _.get(userData, 'spotify_uid');
    const auth0_uid = _.get(userData, 'auth0_uid');

    // fetch activity details
    let activity = await stravaApi.getActivity(strava_uid, stravaTokens, activity_id);

    // get activity start time and end time
    const startDateTimeMillis = new Date(activity.start_date).getTime();
    const endDateTimeMillis = startDateTimeMillis + (activity.elapsed_time * 1000);

    // fetch spotify tracks within activity time range
    const trackList = await spotifyApi.getTracklist(spotify_uid, spotifyTokens, startDateTimeMillis, endDateTimeMillis);

    // If there are tracks in the tracklist, prepend the description with a header
    if (trackList.length > 0) {

        // store tracklist in mongodb
        await mongoTracklistDb.saveTracklist(auth0_uid, { tracklist: trackList }, activity.id);

        // store activity in mongodb
        await mongoActivityDb.saveActivity(auth0_uid, activity);

        // add last_strava_activity to user data
        await mongoUserDb.saveUser("strava", strava_uid, { last_strava_activity: activity })

        // parse tracklist string to append to activity description
        let newActivityDescription = '';

        // for each track in tracklist, append to description string as a minified list
        trackList.forEach((track, index) => {
            newActivityDescription += `${track.artist} - ${track.name}\n`;
        })

        // add footer to tracklist
        newActivityDescription += '\ntracklist by activitrax.app'

        // because there may be other webhooks in the queue, wait for the activity to be updated before continuing
        setTimeout(async () => {
            // fetch activity details again to make sure it has been updated
            activity = await stravaApi.getActivity(strava_uid, stravaTokens, activity_id);

            // if there was already a description, append the tracklist to the end
            if (activity.description) {
                newActivityDescription = activity.description + '\n\n' + newActivityDescription
            }

            await stravaApi.saveActivity(strava_uid, activity_id, newActivityDescription);
        }, 5000);
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
    minifyActivityDetails
};