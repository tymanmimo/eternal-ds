const test = require('node:test');
const assert = require('node:assert/strict');

const { createSpotifyPlaylistThumbnailDecorator } = require('../../../dist/media/spotify/playlistThumbnail') as typeof import('../../../src/media/spotify/playlistThumbnail');

type ThumbnailDependencies = Parameters<typeof createSpotifyPlaylistThumbnailDecorator>[0];
type Decorate = ReturnType<typeof createSpotifyPlaylistThumbnailDecorator>;
const asSearchResult = (value: object) => value as unknown as Parameters<Decorate>[0];

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
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('thumbnail decorator updates playlist and only missing/default track art', async () => {
    const decorated = result();
    const dependencies = {
        cache: new Map(), request: async () => 'https://image/cover.jpg',
    } satisfies ThumbnailDependencies;
    const decorate = createSpotifyPlaylistThumbnailDecorator(dependencies);
    decorate(asSearchResult(decorated), 'spotify:url');
    await settle();
    assert.equal(decorated.playlist.thumbnail, 'https://image/cover.jpg');
    assert.deepEqual(decorated.playlist.tracks.map(track => track.thumbnail), [
        'https://image/cover.jpg', 'https://image/cover.jpg', 'custom',
    ]);
});

test('thumbnail decorator shares in-flight requests', async () => {
    let requests = 0;
    let complete: (value: string) => void = () => undefined;
    const response = new Promise<string>(resolve => { complete = resolve; });
    const dependencies = {
        cache: new Map(), request: async () => { requests++; return response; },
    } satisfies ThumbnailDependencies;
    const decorate = createSpotifyPlaylistThumbnailDecorator(dependencies);
    decorate(asSearchResult(result()), 'same');
    decorate(asSearchResult(result()), 'same');
    assert.equal(requests, 1);
    complete('image');
    await settle();
});

test('failed thumbnail requests are evicted so they can be retried', async () => {
    let requests = 0;
    const dependencies = {
        cache: new Map(), request: async () => { requests++; return null; },
    } satisfies ThumbnailDependencies;
    const decorate = createSpotifyPlaylistThumbnailDecorator(dependencies);
    decorate(asSearchResult(result()), 'retry');
    await settle();
    decorate(asSearchResult(result()), 'retry');
    await settle();
    assert.equal(requests, 2);
});

test('thumbnail decorator ignores non-Spotify results', async () => {
    let requested = false;
    const dependencies = {
        cache: new Map(), request: async () => { requested = true; return 'image'; },
    } satisfies ThumbnailDependencies;
    const decorate = createSpotifyPlaylistThumbnailDecorator(dependencies);
    decorate(asSearchResult({ playlist: { source: 'youtube' } }), 'query');
    await settle();
    assert.equal(requested, false);
});
