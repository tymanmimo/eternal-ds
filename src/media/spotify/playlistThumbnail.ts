import type { SearchResult } from 'discord-player';

const spotifyThumbnailCache = new Map<string, Promise<string | null>>();
const defaultSpotifyThumbnail = 'https://www.scdn.co/i/_global/twitter_card-default.jpg';

const getSpotifyThumbnail = (url: string) => {
    const cached = spotifyThumbnailCache.get(url);
    if (cached) return cached;

    const request = (async () => {
        try {
            const endpoint = new URL('https://open.spotify.com/oembed');
            endpoint.searchParams.set('url', url);
            const response = await fetch(endpoint, { signal: AbortSignal.timeout(5_000) });
            if (!response.ok) return null;
            const data = await response.json() as { thumbnail_url?: string };
            return data.thumbnail_url ?? null;
        } catch {
            return null;
        }
    })();

    spotifyThumbnailCache.set(url, request);
    return request;
};

export const decorateSpotifyPlaylistThumbnail = (result: SearchResult, query: string) => {
    if (result.playlist?.source !== 'spotify') return;

    void getSpotifyThumbnail(query).then(thumbnail => {
        if (!thumbnail || !result.playlist) return;

        result.playlist.thumbnail = thumbnail;
        for (const track of result.playlist.tracks) {
            if (!track.thumbnail || track.thumbnail === defaultSpotifyThumbnail) {
                track.thumbnail = thumbnail;
            }
        }
    });
};
