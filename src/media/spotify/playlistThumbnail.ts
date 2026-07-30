import type { SearchResult } from 'discord-player';

const spotifyThumbnailCache = new Map<string, Promise<string | null>>();
const defaultSpotifyThumbnail = 'https://www.scdn.co/i/_global/twitter_card-default.jpg';

export interface SpotifyThumbnailDependencies {
    cache: Map<string, Promise<string | null>>;
    request: (url: string) => Promise<string | null>;
}

export const createSpotifyPlaylistThumbnailDecorator = (dependencies: SpotifyThumbnailDependencies) => {
    const getSpotifyThumbnail = (url: string) => {
        const cached = dependencies.cache.get(url);
        if (cached) return cached;

        const request = dependencies.request(url).catch(() => null);
        dependencies.cache.set(url, request);
        void request.then(thumbnail => {
            if (!thumbnail && dependencies.cache.get(url) === request) dependencies.cache.delete(url);
        });
        return request;
    };

    return async (result: SearchResult, query: string) => {
        if (result.playlist?.source !== 'spotify') return;

        const thumbnail = await getSpotifyThumbnail(query);
        if (!thumbnail || !result.playlist) return;

        result.playlist.thumbnail = thumbnail;
        for (const track of result.playlist.tracks) {
            if (!track.thumbnail || track.thumbnail === defaultSpotifyThumbnail) {
                track.thumbnail = thumbnail;
            }
        }
    };
};

/* node:coverage disable */
export const decorateSpotifyPlaylistThumbnail = createSpotifyPlaylistThumbnailDecorator({
    cache: spotifyThumbnailCache,
    request: async url => {
        const endpoint = new URL('https://open.spotify.com/oembed');
        endpoint.searchParams.set('url', url);
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return null;
        const data = await response.json() as { thumbnail_url?: string };
        return data.thumbnail_url ?? null;
    },
});
/* node:coverage enable */
