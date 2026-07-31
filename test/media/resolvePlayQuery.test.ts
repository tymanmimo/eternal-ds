const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayQueryResolver } = require('../../dist/media/resolvePlayQuery') as typeof import('../../src/media/resolvePlayQuery');

type ResolverDependencies = Parameters<typeof createPlayQueryResolver>[0];
type Resolver = ReturnType<typeof createPlayQueryResolver>;
type SearchResult = Awaited<ReturnType<Resolver>>;
const asPlayer = (value: object) => value as unknown as Parameters<Resolver>[0];
const asUser = (value: object) => value as unknown as Parameters<Resolver>[2];
const asSearchResult = (value: object) => value as unknown as SearchResult;

test('play query resolver delegates YouTube playlist URLs', async () => {
    const playlist = { playlist: { title: 'list' } };
    const calls: unknown[][] = [];
    const dependencies = {
        isYoutubePlaylistUrl: (query: string) => query.startsWith('yt:'),
        resolveYoutubePlaylist: async (player, query, user) => {
            calls.push([player, query, user]);
            return asSearchResult(playlist);
        },
        decorateSpotifyPlaylistThumbnail: () => { throw new Error('not expected'); },
    } satisfies ResolverDependencies;
    const resolve = createPlayQueryResolver(dependencies);
    const player = { search: async () => { throw new Error('not expected'); } };
    const user = { id: 'user' };
    assert.equal(await resolve(asPlayer(player), 'yt:list', asUser(user)), playlist);
    assert.deepEqual(calls, [[player, 'yt:list', user]]);
});

test('play query resolver searches and starts Spotify decoration for other queries', async () => {
    const searchResult = { tracks: [] };
    const calls: unknown[][] = [];
    const player = { search: async (...args: unknown[]) => { calls.push(['search', ...args]); return searchResult; } };
    const user = { id: 'user' };
    const dependencies = {
        isYoutubePlaylistUrl: () => false,
        resolveYoutubePlaylist: async () => { throw new Error('not expected'); },
        decorateSpotifyPlaylistThumbnail: async (result, query) => { calls.push(['decorate', result, query]); },
    } satisfies ResolverDependencies;
    const resolve = createPlayQueryResolver(dependencies);
    assert.equal(await resolve(asPlayer(player), 'song', asUser(user)), searchResult);
    assert.deepEqual(calls, [
        ['search', 'song', { requestedBy: user }],
        ['decorate', searchResult, 'song'],
    ]);
});
