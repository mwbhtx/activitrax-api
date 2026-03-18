const mockCollection = {};
jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../mongodb/mongodb.service', () => ({ connect: jest.fn(), db: jest.fn(() => ({ collection: jest.fn(() => mockCollection) })) }));
jest.mock('../mongodb/user.repository');
jest.mock('../mongodb/activity.repository');
jest.mock('../mongodb/tracklist.repository');
jest.mock('./strava.api');
jest.mock('../spotify/spotify.api');

const mongoUserDb = require('../mongodb/user.repository');
const mongoActivityDb = require('../mongodb/activity.repository');
const mongoTracklistDb = require('../mongodb/tracklist.repository');
const stravaApi = require('./strava.api');
const spotifyApi = require('../spotify/spotify.api');
const { processActivity, ACTIVITY_STATUS } = require('./strava.service');

const mockActivity = {
  id: 123,
  start_date: '2024-01-01T10:00:00Z',
  elapsed_time: 3600,
  description: null,
};

const mockUser = {
  auth0_uid: 'auth0|abc',
  strava_access_token: 'strava-token',
  strava_refresh_token: 'strava-refresh',
  spotify_uid: 'spotify-user',
  spotify_access_token: 'spotify-token',
  spotify_refresh_token: 'spotify-refresh',
  strava_description_enabled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mongoUserDb.getUser.mockResolvedValue(mockUser);
  stravaApi.getActivity.mockResolvedValue({ ...mockActivity });
  mongoActivityDb.saveActivity.mockResolvedValue();
  mongoActivityDb.updateActivity.mockResolvedValue();
  mongoTracklistDb.saveTracklist.mockResolvedValue();
});

describe('processActivity', () => {
  test('sets status to NO_SPOTIFY when user has no Spotify connected', async () => {
    mongoUserDb.getUser.mockResolvedValue({
      ...mockUser,
      spotify_uid: null,
      spotify_access_token: null,
    });

    await processActivity('strava-uid', 123);

    expect(mongoActivityDb.updateActivity).toHaveBeenCalledWith(
      'auth0|abc',
      123,
      { processing_status: ACTIVITY_STATUS.NO_SPOTIFY }
    );
  });

  test('sets status to NO_TRACKS when Spotify returns empty tracklist', async () => {
    spotifyApi.getTracklist.mockResolvedValue([]);

    await processActivity('strava-uid', 123);

    expect(mongoActivityDb.updateActivity).toHaveBeenCalledWith(
      'auth0|abc',
      123,
      { processing_status: ACTIVITY_STATUS.NO_TRACKS }
    );
  });

  test('saves tracklist and sets SUCCESS when tracks found and description disabled', async () => {
    const tracks = [{ name: 'Song A', artist: 'Artist A' }];
    spotifyApi.getTracklist.mockResolvedValue(tracks);

    await processActivity('strava-uid', 123);

    expect(mongoTracklistDb.saveTracklist).toHaveBeenCalledWith('auth0|abc', { tracklist: tracks }, 123);
    expect(mongoActivityDb.updateActivity).toHaveBeenCalledWith(
      'auth0|abc',
      123,
      { processing_status: ACTIVITY_STATUS.SUCCESS }
    );
  });

  test('sets SPOTIFY_ERROR status when Spotify API throws', async () => {
    spotifyApi.getTracklist.mockRejectedValue(new Error('Spotify unavailable'));

    await processActivity('strava-uid', 123);

    expect(mongoActivityDb.updateActivity).toHaveBeenCalledWith(
      'auth0|abc',
      123,
      { processing_status: ACTIVITY_STATUS.SPOTIFY_ERROR, processing_error: 'Spotify unavailable' }
    );
  });
});
