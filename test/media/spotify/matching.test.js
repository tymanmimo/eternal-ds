const test = require('node:test');
const assert = require('node:assert/strict');

const { getSpotifyMatchScore } = require('../../../dist/media/spotify/matching');

const spotify = { title: 'Beyonce Halo', author: 'Beyonce', durationMS: 240000 };

test('Spotify matching accepts normalized identity and close duration', () => {
    const score = getSpotifyMatchScore(spotify, {
        title: 'Beyonce - Halo (Official Audio)', author: 'BeyonceVEVO', durationMS: 241000,
    });
    assert.equal(typeof score, 'number');
    assert.ok(score > 0.9);
});

test('Spotify matching rejects unexpected variants', () => {
    assert.equal(getSpotifyMatchScore(spotify, {
        title: 'Beyonce Halo live', author: 'Beyonce', durationMS: 240000,
    }), null);
});

test('Spotify matching rejects weak identity and implausible duration', () => {
    assert.equal(getSpotifyMatchScore(spotify, {
        title: 'Different Song', author: 'Someone Else', durationMS: 240000,
    }), null);
    assert.equal(getSpotifyMatchScore(spotify, {
        title: 'Beyonce Halo', author: 'Beyonce', durationMS: 300000,
    }), null);
});
