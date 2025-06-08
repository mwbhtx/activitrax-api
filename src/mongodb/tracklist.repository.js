
const mongoClient = require('./mongodb.service.js');
const tracklistsDb = mongoClient.db().collection('tracklists');


const getStravaActivityTracklist = async (activity_id) => {
    // Fetch Tracklist that pairs with the strava_activity_id from mongodb
    try {
        const result = await tracklistsDb.findOne({ strava_activity_id: activity_id });
        return result;
    }
    catch (err) {
        console.log(err.stack);
    }
}


// // Store tracklist in mongodb
const storeTracklistInMongo = async (auth0_uid, spotify_tracklist, strava_activity_id) => {
    try {
        // append auth0_uid to each activity + strava activity id
        spotify_tracklist.auth0_uid = auth0_uid;
        spotify_tracklist.strava_activity_id = strava_activity_id;

        // Store the activities in the database
        await tracklistsDb.insertOne(spotify_tracklist);

    } catch (err) {
        console.log(err.stack);
    }
}

// Fetch tracklist from MongoDb
const fetchTracklist = async (auth0_uid, strava_activity_id) => {
    try {
        // Fetch the activities from the database
        const result = await tracklistsDb.findOne({ auth0_uid: auth0_uid, strava_activity_id: strava_activity_id })
        return result;
    }
    catch (err) {
        console.log(err.stack);
    }
}

module.exports = {
    fetchTracklist,
    storeTracklistInMongo,
    getStravaActivityTracklist
};