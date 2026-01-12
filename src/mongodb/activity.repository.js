const mongoClient = require('./mongodb.service.js');
const activitiesDb = mongoClient.db().collection('activities');

// Store Strava Activities in MongoDb
const saveActivity = async (auth0_uid, activity) => {
    // append auth0_uid to each activity
    activity.auth0_uid = auth0_uid;

    // insert activity in database
    await activitiesDb.insertOne(activity);
}

// Fetch Strava Activities from MongoDb
const getActivities = async (auth0_uid) => {
    // Fetch the activities from the database
    const result = await activitiesDb.find({ auth0_uid: auth0_uid }).toArray();
    return result;
}

// get most recent strava activity for user
const getLastActivity = async (auth0_uid) => {
    // Fetch the activities from the database
    const result = await activitiesDb.find({ auth0_uid: auth0_uid }).sort({ start_date: -1 }).limit(1).toArray();
    return result[0] || null;
}

// Update an existing activity by strava activity id
const updateActivity = async (auth0_uid, strava_activity_id, updates) => {
    await activitiesDb.updateOne(
        { auth0_uid: auth0_uid, id: strava_activity_id },
        { $set: updates }
    );
}

module.exports = {
    saveActivity,
    getActivities,
    getLastActivity,
    updateActivity
}
