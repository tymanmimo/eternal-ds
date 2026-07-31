const test = require('node:test');
const assert = require('node:assert/strict');

const { getSpotifyMatchScore } = require('../../../dist/media/spotify/matching') as typeof import('../../../src/media/spotify/matching');

const spotify = { title: 'Beyonce Halo', author: 'Beyonce', durationMS: 240000 };
type MatchTrack = Parameters<typeof getSpotifyMatchScore>[0];
const asTrack = (value: object) => value as unknown as MatchTrack;

test('Spotify matching accepts normalized identity and close duration', () => {
    const score = getSpotifyMatchScore(asTrack(spotify), asTrack({
        title: 'Beyonce - Halo (Official Audio)', author: 'BeyonceVEVO', durationMS: 241000,
    }));
    assert.equal(typeof score, 'number');
    assert.ok(score !== null && score > 0.9);
});

test('Spotify matching rejects unexpected variants', () => {
    assert.equal(getSpotifyMatchScore(asTrack(spotify), asTrack({
        title: 'Beyonce Halo live', author: 'Beyonce', durationMS: 240000,
    })), null);
});

test('Spotify matching rejects weak identity and implausible duration', () => {
    assert.equal(getSpotifyMatchScore(asTrack(spotify), asTrack({
        title: 'Different Song', author: 'Someone Else', durationMS: 240000,
    })), null);
    assert.equal(getSpotifyMatchScore(asTrack(spotify), asTrack({
        title: 'Beyonce Halo', author: 'Beyonce', durationMS: 300000,
    })), null);
});
