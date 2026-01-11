/**
 * Backfill script to add track_count to existing activities
 *
 * Run with: node scripts/backfill-track-counts.js
 */

require('dotenv').config();
const mongoClient = require('../src/mongodb/mongodb.service.js');

const run = async () => {
    try {
        const db = mongoClient.db();
        const activitiesDb = db.collection('activities');
        const tracklistsDb = db.collection('tracklists');

        // Find all activities without track_count
        const activitiesWithoutCount = await activitiesDb.find({
            track_count: { $exists: false }
        }).toArray();

        console.log(`Found ${activitiesWithoutCount.length} activities without track_count`);

        let updated = 0;
        let notFound = 0;

        for (const activity of activitiesWithoutCount) {
            // Look up the tracklist by strava_activity_id
            const tracklist = await tracklistsDb.findOne({
                strava_activity_id: activity.id
            });

            if (tracklist && tracklist.tracklist) {
                const trackCount = tracklist.tracklist.length;
                await activitiesDb.updateOne(
                    { _id: activity._id },
                    {
                        $set: {
                            track_count: trackCount,
                            processing_status: 'success'
                        }
                    }
                );
                console.log(`Updated activity ${activity.id} (${activity.name}): ${trackCount} tracks`);
                updated++;
            } else {
                console.log(`No tracklist found for activity ${activity.id} (${activity.name})`);
                notFound++;
            }
        }

        console.log(`\nDone! Updated ${updated} activities, ${notFound} had no tracklist.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

run();
