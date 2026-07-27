import { spawn } from 'node:child_process';
import { Player, Playlist, QueryType, Track, Util } from 'discord-player';
import { User } from 'discord.js';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { Flags } from 'youtube-dl-exec';
import {
    getNumberSetting,
    getYoutubeDlArgs,
    getYoutubeDlProcessError,
    getYoutubeRetryCount,
    waitForYoutubeDlUpdate,
    withYoutubeDlLock,
    youtubeDlPath,
} from './runtime';

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

const getYoutubeJson = <T>(url: string, flags: Flags, timeoutMs: number) => {
    return new Promise<T>((resolveJson, rejectJson) => {
        const subprocess = spawn(youtubeDlPath, [url, ...getYoutubeDlArgs(flags)], {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let tooLarge = false;
        const settle = (operation: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            operation();
        };
        const timeout = setTimeout(() => {
            timedOut = true;
            subprocess.kill();
        }, timeoutMs);

        subprocess.stdout.on('data', chunk => {
            if (settled) return;
            stdout += String(chunk);
            if (stdout.length > 50 * 1024 * 1024) {
                tooLarge = true;
                subprocess.stdout.destroy();
                subprocess.kill();
            }
        });
        subprocess.stderr.on('data', chunk => {
            stderr = `${stderr}${String(chunk)}`.slice(-4_000);
        });
        subprocess.once('error', error => settle(() => rejectJson(error)));
        subprocess.once('close', code => {
            if (tooLarge) {
                settle(() => rejectJson(new Error('yt-dlp metadata exceeded 50 MiB')));
                return;
            }
            if (timedOut) {
                settle(() => rejectJson(new Error(`yt-dlp metadata timed out after ${timeoutMs}ms`)));
                return;
            }
            if (code !== 0) {
                settle(() => rejectJson(getYoutubeDlProcessError(stderr, code, 'yt-dlp metadata')));
                return;
            }
            try {
                const data = JSON.parse(stdout) as T;
                settle(() => resolveJson(data));
            } catch {
                settle(() => rejectJson(new Error('yt-dlp returned invalid metadata JSON')));
            }
        });
    });
};

const getYoutubePlaylistMetadata = async <T>(url: string): Promise<T> => {
    await waitForYoutubeDlUpdate();

    const flags: Flags = {
        dumpSingleJson: true,
        flatPlaylist: true,
        jsRuntimes: 'node',
        noWarnings: true,
        skipDownload: true,
    };
    if (process.env.YOUTUBE_PROXY) flags.proxy = process.env.YOUTUBE_PROXY;

    const retries = getYoutubeRetryCount();
    const timeoutMs = getNumberSetting('YOUTUBE_PLAYLIST_TIMEOUT_MS', 30_000, 5_000, 60_000);
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await withYoutubeDlLock(() => getYoutubeJson<T>(url, flags, timeoutMs));
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await new Promise(resolveRetry => setTimeout(resolveRetry, attempt * 500));
            }
        }
    }

    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`Unable to resolve a YouTube playlist after ${retries} attempts${detail}`);
};

const getBestThumbnail = (thumbnails?: ThumbnailData[]) => {
    return thumbnails
        ?.filter(thumbnail => thumbnail.url)
        .sort((left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0))[0]?.url;
};

export const isYoutubePlaylistUrl = (query: string) => {
    try {
        const url = new URL(query);
        const host = url.hostname.replace(/^www\./, '');
        return (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
            && url.searchParams.has('list');
    } catch {
        return false;
    }
};

export const resolveYoutubePlaylist = async (player: Player, url: string, requestedBy: User) => {
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
    return player.search(playlist, { requestedBy });
};
