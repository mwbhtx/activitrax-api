const mongoClient = require('./mongodb.service.js');
const { ObjectId } = require('mongodb');
const _ = require('lodash');
const likedTracksDb = mongoClient.db().collection('liked_tracks');
const trackRepository = require('./track.repository.js');

/**
 * Like a track - upserts the track metadata and creates the like relationship
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {Object} trackData - Full track metadata
 * @returns {Object} { liked: true, track_id: ObjectId }
 */
const likeTrack = async (auth0_uid, trackData) => {
    // First, upsert the track to ensure it exists
    const track = await trackRepository.upsertTrack(trackData);

    // Then create the like relationship (ignore if already exists)
    try {
        await likedTracksDb.insertOne({
            auth0_uid,
            track_id: track._id,
            liked_at: new Date()
        });
    } catch (error) {
        // Duplicate key error means already liked - that's fine
        if (error.code !== 11000) {
            throw error;
        }
    }

    return { liked: true, track_id: track._id };
};

/**
 * Unlike a track - removes the like relationship
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {string} spotify_track_id - Spotify track ID
 * @returns {Object} { liked: false }
 */
const unlikeTrack = async (auth0_uid, spotify_track_id) => {
    // Get the track to find its _id
    const track = await trackRepository.getTrackBySpotifyId(spotify_track_id);

    if (track) {
        await likedTracksDb.deleteOne({
            auth0_uid,
            track_id: track._id
        });
    }

    return { liked: false };
};

/**
 * Check if a user has liked a track
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {string} spotify_track_id - Spotify track ID
 * @returns {boolean}
 */
const isTrackLiked = async (auth0_uid, spotify_track_id) => {
    const track = await trackRepository.getTrackBySpotifyId(spotify_track_id);
    if (!track) return false;

    const like = await likedTracksDb.findOne({
        auth0_uid,
        track_id: track._id
    });

    return !!like;
};

/**
 * Get all liked track IDs for a user (for dashboard state)
 * @param {string} auth0_uid - User's Auth0 ID
 * @returns {string[]} Array of spotify_track_ids
 */
const getLikedTrackIds = async (auth0_uid) => {
    const likes = await likedTracksDb.find({ auth0_uid }).toArray();
    const trackIds = likes.map(like => like.track_id);

    if (trackIds.length === 0) return [];

    const tracks = await trackRepository.getTracksByIds(trackIds);
    return tracks.map(track => track.spotify_track_id);
};

/**
 * Get all liked tracks with full metadata for a user (for liked tracks page)
 * @param {string} auth0_uid - User's Auth0 ID
 * @returns {Object[]} Array of track objects with liked_at
 */
const getLikedTracksWithMetadata = async (auth0_uid) => {
    const results = await likedTracksDb.aggregate([
        { $match: { auth0_uid } },
        { $sort: { liked_at: -1 } },
        {
            $lookup: {
                from: 'tracks',
                localField: 'track_id',
                foreignField: '_id',
                as: 'track'
            }
        },
        { $unwind: '$track' },
        {
            $project: {
                _id: 0,
                spotify_track_id: '$track.spotify_track_id',
                spotify_uri: '$track.spotify_uri',
                name: '$track.name',
                artist: '$track.artist',
                album: '$track.album',
                album_image: '$track.album_image',
                spotify_url: '$track.spotify_url',
                duration_ms: '$track.duration_ms',
                liked_at: 1
            }
        }
    ]).toArray();

    return results;
};

module.exports = {
    likeTrack,
    unlikeTrack,
    isTrackLiked,
    getLikedTrackIds,
    getLikedTracksWithMetadata
};
