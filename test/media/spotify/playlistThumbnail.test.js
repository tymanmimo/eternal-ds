const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpotifyPlaylistThumbnailDecorator } = require('../../../dist/media/spotify/playlistThumbnail');

const result = () => ({
    playlist: {
        source: 'spotify',
        thumbnail: 'old',
        tracks: [
            { thumbnail: '' },
            { thumbnail: 'https://www.scdn.co/i/_global/twitter_card-default.jpg' },
            { thumbnail: 'custom' },
        ],
    },
});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('thumbnail decorator updates playlist and only missing/default track art', async () => {
    const decorated = result();
    const decorate = createSpotifyPlaylistThumbnailDecorator({
        cache: new Map(), request: async () => 'https://image/cover.jpg',
    });
    decorate(decorated, 'spotify:url');
    await settle();
    assert.equal(decorated.playlist.thumbnail, 'https://image/cover.jpg');
    assert.deepEqual(decorated.playlist.tracks.map(track => track.thumbnail), [
        'https://image/cover.jpg', 'https://image/cover.jpg', 'custom',
    ]);
});

test('thumbnail decorator shares in-flight requests', async () => {
    let requests = 0;
    let complete;
    const response = new Promise(resolve => { complete = resolve; });
    const decorate = createSpotifyPlaylistThumbnailDecorator({
        cache: new Map(), request: async () => { requests++; return response; },
    });
    decorate(result(), 'same');
    decorate(result(), 'same');
    assert.equal(requests, 1);
    complete('image');
    await settle();
});

test('failed thumbnail requests are evicted so they can be retried', async () => {
    let requests = 0;
    const decorate = createSpotifyPlaylistThumbnailDecorator({
        cache: new Map(), request: async () => { requests++; return null; },
    });
    decorate(result(), 'retry');
    await settle();
    decorate(result(), 'retry');
    await settle();
    assert.equal(requests, 2);
});

test('thumbnail decorator ignores non-Spotify results', async () => {
    let requested = false;
    const decorate = createSpotifyPlaylistThumbnailDecorator({
        cache: new Map(), request: async () => { requested = true; return 'image'; },
    });
    decorate({ playlist: { source: 'youtube' } }, 'query');
    await settle();
    assert.equal(requested, false);
});
