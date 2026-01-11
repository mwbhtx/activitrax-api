/**
 * Backfill script to add album_image, preview_url, and spotify_url to existing tracks
 *
 * Uses the stored track href to fetch full track details from Spotify API
 * Uses a single admin Spotify token for all requests
 *
 * Run with: node scripts/backfill-track-metadata.js
 */

require('dotenv').config();
const axios = require('axios');
const mongoClient = require('../src/mongodb/mongodb.service.js');

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

// Admin user auth0_uid - set this to your user ID
const ADMIN_AUTH0_UID = process.env.ADMIN_AUTH0_UID;

let adminTokens = null;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const exchangeRefreshToken = async (refresh_token) => {
    const response = await axios({
        method: "POST",
        url: "https://accounts.spotify.com/api/token",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refresh_token,
            client_id: spotifyClientId,
            client_secret: spotifyClientSecret,
        }).toString()
    });

    return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refresh_token
    };
};

const getAdminTokens = async () => {
    if (adminTokens) {
        return adminTokens;
    }

    const usersDb = mongoClient.db().collection('users');
    const adminUser = await usersDb.findOne({ auth0_uid: ADMIN_AUTH0_UID });

    if (!adminUser || !adminUser.spotify_access_token) {
        throw new Error(`Admin user not found or has no Spotify tokens. Set ADMIN_AUTH0_UID in .env`);
    }

    adminTokens = {
        access_token: adminUser.spotify_access_token,
        refresh_token: adminUser.spotify_refresh_token,
        spotify_uid: adminUser.spotify_uid
    };

    console.log(`Using admin Spotify account: ${adminUser.spotify_uid}`);
    return adminTokens;
};

const fetchTrackFromSpotify = async (trackHref) => {
    const tokens = await getAdminTokens();

    try {
        const response = await axios.get(trackHref, {
            headers: {
                "Authorization": `Bearer ${tokens.access_token}`
            }
        });
        return response.data;
    } catch (error) {
        if (error.response?.status === 401) {
            // Token expired, refresh and retry
            console.log('  Admin token expired, refreshing...');
            const newTokens = await exchangeRefreshToken(tokens.refresh_token);
            adminTokens = { ...adminTokens, ...newTokens };

            // Update admin user's tokens in DB
            const usersDb = mongoClient.db().collection('users');
            await usersDb.updateOne(
                { auth0_uid: ADMIN_AUTH0_UID },
                {
                    $set: {
                        spotify_access_token: newTokens.access_token,
                        spotify_refresh_token: newTokens.refresh_token
                    }
                }
            );

            const response = await axios.get(trackHref, {
                headers: {
                    "Authorization": `Bearer ${newTokens.access_token}`
                }
            });
            return response.data;
        }
        throw error;
    }
};

const run = async () => {
    try {
        if (!ADMIN_AUTH0_UID) {
            console.error('Error: ADMIN_AUTH0_UID environment variable not set');
            console.log('Add ADMIN_AUTH0_UID=your_auth0_uid to your .env file');
            process.exit(1);
        }

        const db = mongoClient.db();
        const tracklistsDb = db.collection('tracklists');

        // Verify admin tokens work
        await getAdminTokens();

        // Find all tracklists that have tracks without album_image
        const tracklists = await tracklistsDb.find({}).toArray();

        console.log(`Found ${tracklists.length} tracklists to check\n`);

        let tracklistsUpdated = 0;
        let tracksUpdated = 0;
        let tracksFailed = 0;
        let tracklistsSkipped = 0;

        for (const tracklist of tracklists) {
            if (!tracklist.tracklist || tracklist.tracklist.length === 0) {
                continue;
            }

            // Check if any tracks need updating
            const tracksNeedingUpdate = tracklist.tracklist.filter(
                track => track.href && !track.album_image
            );

            if (tracksNeedingUpdate.length === 0) {
                tracklistsSkipped++;
                continue;
            }

            console.log(`Processing activity ${tracklist.strava_activity_id}: ${tracksNeedingUpdate.length} tracks need metadata`);

            // Update each track
            let updated = false;
            for (let i = 0; i < tracklist.tracklist.length; i++) {
                const track = tracklist.tracklist[i];

                if (!track.href || track.album_image) {
                    continue;
                }

                try {
                    const spotifyTrack = await fetchTrackFromSpotify(track.href);

                    // Get smallest album image (64px)
                    const albumImages = spotifyTrack.album?.images || [];
                    const albumImage = albumImages.length > 0
                        ? (albumImages.find(img => img.width === 64) || albumImages[albumImages.length - 1]).url
                        : null;

                    // Update track with new metadata
                    tracklist.tracklist[i] = {
                        ...track,
                        album_image: albumImage,
                        preview_url: spotifyTrack.preview_url || null,
                        spotify_url: spotifyTrack.external_urls?.spotify || null
                    };

                    console.log(`  ✓ ${track.name} by ${track.artist}`);
                    tracksUpdated++;
                    updated = true;

                    // Rate limit: Spotify allows ~30 requests/second, be conservative
                    await delay(100);

                } catch (error) {
                    console.log(`  ✗ ${track.name} - ${error.message}`);
                    tracksFailed++;
                }
            }

            // Save updated tracklist back to database
            if (updated) {
                await tracklistsDb.updateOne(
                    { _id: tracklist._id },
                    { $set: { tracklist: tracklist.tracklist } }
                );
                tracklistsUpdated++;
            }
        }

        console.log(`\n========================================`);
        console.log(`Done!`);
        console.log(`Tracklists updated: ${tracklistsUpdated}`);
        console.log(`Tracklists skipped (already complete): ${tracklistsSkipped}`);
        console.log(`Tracks updated: ${tracksUpdated}`);
        console.log(`Tracks failed: ${tracksFailed}`);
        console.log(`========================================`);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

run();
