const mongoClient = require('./mongodb.service.js');
const _ = require('lodash');
const tracksDb = mongoClient.db().collection('tracks');

/**
 * Upsert a track - creates if doesn't exist, returns existing if it does
 * @param {Object} trackData - Track metadata from Spotify
 * @returns {Object} The track document (with _id)
 */
const upsertTrack = async (trackData) => {
    const { spotify_track_id } = trackData;

    if (!spotify_track_id) {
        throw new Error('spotify_track_id is required');
    }

    const result = await tracksDb.findOneAndUpdate(
        { spotify_track_id },
        {
            $setOnInsert: {
                spotify_track_id: trackData.spotify_track_id,
                spotify_uri: trackData.spotify_uri,
                name: trackData.name,
                artist: trackData.artist,
                album: trackData.album,
                album_image: trackData.album_image,
                spotify_url: trackData.spotify_url,
                duration_ms: trackData.duration_ms,
                created_at: new Date()
            }
        },
        { upsert: true, returnDocument: 'after' }
    );

    return result;
};

/**
 * Get a track by spotify_track_id
 */
const getTrackBySpotifyId = async (spotify_track_id) => {
    return await tracksDb.findOne({ spotify_track_id });
};

/**
 * Get multiple tracks by their ObjectIds
 */
const getTracksByIds = async (trackIds) => {
    return await tracksDb.find({ _id: { $in: trackIds } }).toArray();
};

module.exports = {
    upsertTrack,
    getTrackBySpotifyId,
    getTracksByIds
};
