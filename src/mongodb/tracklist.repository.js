
const mongoClient = require('./mongodb.service.js');
const tracklistsDb = mongoClient.db().collection('tracklists');

const getTracklist = async (activity_id) => {
    // Fetch Tracklist that pairs with the strava_activity_id from mongodb
    const result = await tracklistsDb.findOne({ strava_activity_id: activity_id });
    return result;
}


// Store tracklist in mongodb
const saveTracklist = async (auth0_uid, spotify_tracklist, strava_activity_id) => {
    // append auth0_uid to each activity + strava activity id
    spotify_tracklist.auth0_uid = auth0_uid;
    spotify_tracklist.strava_activity_id = strava_activity_id;

    // Store the activities in the database
    await tracklistsDb.insertOne(spotify_tracklist);
}

module.exports = {
    saveTracklist,
    getTracklist
};