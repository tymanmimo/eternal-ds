import { Player, Playlist, QueryType, Track, Util } from 'discord-player';
import { User } from 'discord.js';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { getYoutubePlaylistMetadata } from './youtubeStream';

interface ThumbnailData {
    url: string;
    width?: number;
    height?: number;
}

interface YoutubePlaylistEntry {
    id?: string;
    title?: string;
    description?: string;
    duration?: number;
    uploader?: string;
    channel?: string;
    view_count?: number;
    live_status?: string;
    availability?: string;
    thumbnails?: ThumbnailData[];
}

interface YoutubePlaylistData {
    id: string;
    title: string;
    description?: string;
    uploader?: string;
    channel?: string;
    uploader_url?: string;
    channel_url?: string;
    webpage_url?: string;
    thumbnails?: ThumbnailData[];
    entries?: YoutubePlaylistEntry[];
}

const spotifyThumbnailCache = new Map<string, Promise<string | null>>();
const defaultSpotifyThumbnail = 'https://www.scdn.co/i/_global/twitter_card-default.jpg';

const getBestThumbnail = (thumbnails?: ThumbnailData[]) => {
    return thumbnails
        ?.filter(thumbnail => thumbnail.url)
        .sort((left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0))[0]?.url;
};

const isYoutubePlaylistUrl = (query: string) => {
    try {
        const url = new URL(query);
        const host = url.hostname.replace(/^www\./, '');
        return (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
            && url.searchParams.has('list');
    } catch {
        return false;
    }
};

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

const createYoutubePlaylist = async (player: Player, url: string, requestedBy: User) => {
    const data = await getYoutubePlaylistMetadata<YoutubePlaylistData>(url);
    const extractor = player.extractors.get(YoutubeExtractor.identifier);
    if (!extractor) throw new Error('YouTube extractor is not available');

    const playlist = new Playlist(player, {
        title: data.title || 'Unknown YouTube playlist',
        description: data.description || data.title || '',
        thumbnail: getBestThumbnail(data.thumbnails) || '',
        type: 'playlist',
        source: 'youtube',
        author: {
            name: data.channel || data.uploader || 'Unknown Author',
            url: data.channel_url || data.uploader_url || 'https://www.youtube.com/',
        },
        tracks: [],
        id: data.id,
        url: data.webpage_url || url,
    });

    playlist.tracks = (data.entries ?? [])
        .filter(entry => entry.id && entry.title)
        .filter(entry => entry.availability !== 'private' && !/^\[(private|deleted) video\]$/i.test(entry.title!))
        .map(entry => {
            const track = new Track(player, {
                title: entry.title!,
                description: entry.description || entry.title!,
                author: entry.channel || entry.uploader || playlist.author.name,
                url: `https://www.youtube.com/watch?v=${entry.id}`,
                thumbnail: getBestThumbnail(entry.thumbnails) || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
                duration: Util.buildTimeCode(Util.parseMS((entry.duration ?? 0) * 1000)),
                views: entry.view_count ?? 0,
                requestedBy,
                playlist,
                source: 'youtube',
                queryType: QueryType.YOUTUBE_VIDEO,
                live: entry.live_status === 'is_live',
                raw: entry,
            });
            track.extractor = extractor;
            return track;
        });

    if (!playlist.tracks.length) throw new Error('YouTube playlist does not contain playable tracks');
    return playlist;
};

export const resolvePlayQuery = async (player: Player, query: string, requestedBy: User) => {
    if (isYoutubePlaylistUrl(query)) {
        const playlist = await createYoutubePlaylist(player, query, requestedBy);
        return player.search(playlist, { requestedBy });
    }

    const result = await player.search(query, { requestedBy });
    if (result.playlist?.source === 'spotify') {
        const thumbnail = await getSpotifyThumbnail(query);
        if (thumbnail) {
            result.playlist.thumbnail = thumbnail;
            for (const track of result.playlist.tracks) {
                if (!track.thumbnail || track.thumbnail === defaultSpotifyThumbnail) {
                    track.thumbnail = thumbnail;
                }
            }
        }
    }
    return result;
};
