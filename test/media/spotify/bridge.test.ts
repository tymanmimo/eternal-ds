const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const { createSpotifyBridge } = require('../../../dist/media/spotify/bridge') as typeof import('../../../src/media/spotify/bridge');
type BridgeDependencies = Parameters<typeof createSpotifyBridge>[0];

interface FakeSpotifyTrack {
    source: string;
    author: string;
    title: string;
    durationMS: number;
    requestedBy: null;
    bridgedTrack?: ReturnType<typeof candidate>;
}

const spotifyTrack = (): FakeSpotifyTrack => ({ source: 'spotify', author: 'Artist', title: 'Song', durationMS: 1000, requestedBy: null });
const candidate = (url: string, score: number) => ({ url, live: false, extractor: { identifier: url }, score });

const scores = new WeakMap<object, number>();

const createBridge = (overrides: Partial<BridgeDependencies> = {}) => {
    const cache: BridgeDependencies['cache'] = new Map();
    const calls: unknown[] = [];
    const dependencies = {
        cache,
        cacheTtl: 1000,
        now: () => 100,
        createStream: async url => { calls.push(url); return Readable.from(url); },
        getMatchScore: (_track, item) => scores.get(item) ?? null,
        logTiming: (...args) => calls.push(args),
        ...overrides,
    } satisfies BridgeDependencies;
    return {
        bridge: createSpotifyBridge(dependencies),
        cache,
        calls,
    };
};

type Bridge = ReturnType<typeof createSpotifyBridge>;
const asPlayer = (value: object) => value as unknown as Parameters<Bridge>[0];
const asTrack = (value: object) => value as unknown as Parameters<Bridge>[1];
const scoredCandidate = (url: string, score: number) => {
    const value = candidate(url, score);
    const track = asTrack(value);
    scores.set(track, score);
    return track;
};

test('Spotify bridge ignores non-Spotify tracks', async () => {
    const { bridge } = createBridge();
    assert.equal(await bridge(asPlayer({}), asTrack({ source: 'youtube' })), null);
});

test('Spotify bridge chooses the highest scoring playable result and caches it', async () => {
    const { bridge, calls } = createBridge();
    const player = { search: async () => ({ tracks: [scoredCandidate('low', 0.8), scoredCandidate('high', 0.99)] }) };
    const first = spotifyTrack();
    assert.ok(await bridge(asPlayer(player), asTrack(first)) instanceof Readable);
    assert.equal(first.bridgedTrack?.url, 'high');

    const second = spotifyTrack();
    await bridge(asPlayer({ search: async () => { throw new Error('cache miss'); } }), asTrack(second));
    assert.equal(second.bridgedTrack?.url, 'high');
    assert.deepEqual(calls.filter((call): call is string => typeof call === 'string'), ['high', 'high']);
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
    const player = { search: async () => ({ tracks: [scoredCandidate(searches++ ? 'fresh' : 'first', 1)] }) };
    const first = spotifyTrack();
    await bridge(asPlayer(player), asTrack(first));
    if (!first.bridgedTrack) throw new Error('First bridge did not select a track');
    first.bridgedTrack.url = 'stale';
    const second = spotifyTrack();
    await bridge(asPlayer(player), asTrack(second));
    assert.equal(second.bridgedTrack?.url, 'fresh');
    assert.equal(streamCalls, 3);
});

test('Spotify bridge rejects when no reliable candidate can stream', async () => {
    const { bridge } = createBridge({ createStream: async () => { throw new Error('bad stream'); } });
    await assert.rejects(
        bridge(asPlayer({ search: async () => ({ tracks: [scoredCandidate('bad', 1)] }) }), asTrack(spotifyTrack())),
        /No reliable YouTube match/,
    );
});
