const mongoClient = require('./mongodb.service.js');
const activitiesDb = mongoClient.db().collection('activities');

// Store Strava Activities in MongoDb
const storeActivity = async (auth0_uid, activity) => {
    try {
        // append auth0_uid to each activity
        activity.auth0_uid = auth0_uid;

        // insert activity in database
        await activitiesDb.insertOne(activity);

    } catch (err) {
        console.log(err.stack);
    }
}

// Fetch Strava Activities from MongoDb 
const fetchStravaActivities = async (auth0_uid) => {
    try {
        // Fetch the activities from the database
        const result = await activitiesDb.find({ auth0_uid: auth0_uid }).toArray();
        return result;

    } catch (err) {
        console.log(err.stack);
    }
}

// get most recent strava activity for user
const getLastStravaActivity = async (auth0_uid) => {
    try {
        // Fetch the activities from the database
        const result = await activitiesDb.find({ auth0_uid: auth0_uid }).sort({ start_date: -1 }).limit(1)
        return result;

    } catch (err) {
        console.log(err.stack);
    }
}

module.exports = {
    storeActivity,
    fetchStravaActivities,
    getLastStravaActivity
}
