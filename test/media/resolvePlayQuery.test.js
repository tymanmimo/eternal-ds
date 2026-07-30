const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayQueryResolver } = require('../../dist/media/resolvePlayQuery');

test('play query resolver delegates YouTube playlist URLs', async () => {
    const playlist = { playlist: { title: 'list' } };
    const calls = [];
    const resolve = createPlayQueryResolver({
        isYoutubePlaylistUrl: query => query.startsWith('yt:'),
        resolveYoutubePlaylist: async (...args) => { calls.push(args); return playlist; },
        decorateSpotifyPlaylistThumbnail: () => { throw new Error('not expected'); },
    });
    const player = { search: async () => { throw new Error('not expected'); } };
    const user = { id: 'user' };
    assert.equal(await resolve(player, 'yt:list', user), playlist);
    assert.deepEqual(calls, [[player, 'yt:list', user]]);
});

test('play query resolver searches and starts Spotify decoration for other queries', async () => {
    const searchResult = { tracks: [] };
    const calls = [];
    const player = { search: async (...args) => { calls.push(['search', ...args]); return searchResult; } };
    const user = { id: 'user' };
    const resolve = createPlayQueryResolver({
        isYoutubePlaylistUrl: () => false,
        resolveYoutubePlaylist: async () => { throw new Error('not expected'); },
        decorateSpotifyPlaylistThumbnail: (...args) => calls.push(['decorate', ...args]),
    });
    assert.equal(await resolve(player, 'song', user), searchResult);
    assert.deepEqual(calls, [
        ['search', 'song', { requestedBy: user }],
        ['decorate', searchResult, 'song'],
    ]);
});
