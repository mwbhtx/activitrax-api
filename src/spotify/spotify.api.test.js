jest.mock('../mongodb/mongodb.service', () => ({
  connect: jest.fn(),
  db: jest.fn(() => ({ collection: jest.fn(() => ({})) }))
}));
jest.mock('../mongodb/user.repository');
jest.mock('axios');

const axios = require('axios');
const { getTracklist } = require('./spotify.api');

const makeTrack = (name, artist, played_at, images = []) => ({
  played_at,
  track: {
    name,
    artists: [{ name: artist }],
    album: { name: 'Album', images },
    duration_ms: 200000,
    href: 'https://api.spotify.com/track/1',
    preview_url: null,
    external_urls: { spotify: `https://open.spotify.com/track/${name}` },
  },
});

const tokens = { access_token: 'token', refresh_token: 'refresh' };

beforeEach(() => jest.clearAllMocks());

describe('getTracklist', () => {
  test('filters out tracks played after end_time', async () => {
    const start = new Date('2024-01-01T10:00:00Z').getTime();
    const end = new Date('2024-01-01T11:00:00Z').getTime();

    axios.mockResolvedValue({
      data: {
        items: [
          makeTrack('Within range', 'Artist A', '2024-01-01T10:30:00Z'),
          makeTrack('Too late', 'Artist B', '2024-01-01T11:30:00Z'),
        ],
      },
    });

    const tracks = await getTracklist('uid', tokens, start, end);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe('Within range');
  });

  test('returns tracks sorted oldest first', async () => {
    const start = new Date('2024-01-01T10:00:00Z').getTime();

    axios.mockResolvedValue({
      data: {
        items: [
          makeTrack('Third', 'Artist', '2024-01-01T10:50:00Z'),
          makeTrack('First', 'Artist', '2024-01-01T10:10:00Z'),
          makeTrack('Second', 'Artist', '2024-01-01T10:30:00Z'),
        ],
      },
    });

    const tracks = await getTracklist('uid', tokens, start, null);

    expect(tracks.map(t => t.name)).toEqual(['First', 'Second', 'Third']);
  });

  test('maps track fields correctly', async () => {
    const start = new Date('2024-01-01T10:00:00Z').getTime();
    const images = [{ url: 'large.jpg', width: 300 }, { url: 'small.jpg', width: 64 }];

    axios.mockResolvedValue({
      data: {
        items: [makeTrack('My Song', 'My Artist', '2024-01-01T10:15:00Z', images)],
      },
    });

    const tracks = await getTracklist('uid', tokens, start, null);

    expect(tracks[0]).toMatchObject({
      name: 'My Song',
      artist: 'My Artist',
      album: 'Album',
      album_image: 'small.jpg',
    });
  });

  test('returns empty array when no tracks in range', async () => {
    const start = new Date('2024-01-01T10:00:00Z').getTime();
    const end = new Date('2024-01-01T11:00:00Z').getTime();

    axios.mockResolvedValue({
      data: {
        items: [makeTrack('Too late', 'Artist', '2024-01-01T12:00:00Z')],
      },
    });

    const tracks = await getTracklist('uid', tokens, start, end);

    expect(tracks).toHaveLength(0);
  });
});
