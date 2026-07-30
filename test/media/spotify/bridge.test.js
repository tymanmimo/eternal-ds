const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const { createSpotifyBridge } = require('../../../dist/media/spotify/bridge');

const spotifyTrack = () => ({ source: 'spotify', author: 'Artist', title: 'Song', durationMS: 1000, requestedBy: null });
const candidate = (url, score) => ({ url, live: false, extractor: { identifier: url }, score });

const createBridge = (overrides = {}) => {
    const cache = new Map();
    const calls = [];
    const dependencies = {
        cache,
        cacheTtl: 1000,
        now: () => 100,
        createStream: async url => { calls.push(url); return Readable.from(url); },
        getMatchScore: (_track, item) => item.score,
        logTiming: (...args) => calls.push(args),
        ...overrides,
    };
    return { bridge: createSpotifyBridge(dependencies), cache, calls };
};

test('Spotify bridge ignores non-Spotify tracks', async () => {
    const { bridge } = createBridge();
    assert.equal(await bridge({}, { source: 'youtube' }), null);
});

test('Spotify bridge chooses the highest scoring playable result and caches it', async () => {
    const { bridge, calls } = createBridge();
    const player = { search: async () => ({ tracks: [candidate('low', 0.8), candidate('high', 0.99)] }) };
    const first = spotifyTrack();
    assert.ok(await bridge(player, first) instanceof Readable);
    assert.equal(first.bridgedTrack.url, 'high');

    const second = spotifyTrack();
    await bridge({ search: async () => { throw new Error('cache miss'); } }, second);
    assert.equal(second.bridgedTrack.url, 'high');
    assert.deepEqual(calls.filter(call => typeof call === 'string'), ['high', 'high']);
});

test('Spotify bridge evicts an unusable cached candidate and searches again', async () => {
    let streamCalls = 0;
    let searches = 0;
    const { bridge } = createBridge({
        createStream: async url => {
            streamCalls++;
            if (url === 'stale') throw new Error('gone');
            return Readable.from(url);
        },
    });
    const player = { search: async () => ({ tracks: [candidate(searches++ ? 'fresh' : 'first', 1)] }) };
    const first = spotifyTrack();
    await bridge(player, first);
    first.bridgedTrack.url = 'stale';
    const second = spotifyTrack();
    await bridge(player, second);
    assert.equal(second.bridgedTrack.url, 'fresh');
    assert.equal(streamCalls, 3);
});

test('Spotify bridge rejects when no reliable candidate can stream', async () => {
    const { bridge } = createBridge({ createStream: async () => { throw new Error('bad stream'); } });
    await assert.rejects(
        bridge({ search: async () => ({ tracks: [candidate('bad', 1)] }) }, spotifyTrack()),
        /No reliable YouTube match/,
    );
});
