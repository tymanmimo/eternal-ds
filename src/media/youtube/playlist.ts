import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { Player, Playlist, QueryType, Track, Util } from 'discord-player';
import { User } from 'discord.js';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { Flags } from 'youtube-dl-exec';
import { getYoutubeDlProcessError, YoutubeDlRuntime, youtubeDlRuntime } from './runtime';

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

export interface YoutubeJsonReaderOptions {
    spawn?: typeof spawn;
    runtime?: YoutubeDlRuntime;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    maximumBytes?: number;
}

export const createYoutubeJsonReader = (options: YoutubeJsonReaderOptions = {}) => {
    const spawnProcess = options.spawn ?? spawn;
    const runtime = options.runtime ?? youtubeDlRuntime;
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const cancelTimeout = options.clearTimeout ?? clearTimeout;
    const maximumBytes = options.maximumBytes ?? 50 * 1024 * 1024;

    return <T>(url: string, flags: Flags, timeoutMs: number) => new Promise<T>((resolveJson, rejectJson) => {
        const subprocess = spawnProcess(runtime.youtubeDlPath, [url, ...runtime.getYoutubeDlArgs(flags)], {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        const stdoutDecoder = new StringDecoder('utf8');
        let stdout = '';
        let stdoutBytes = 0;
        let stderr = '';
        let settled = false;
        const settle = (operation: () => void) => {
            if (settled) return false;
            settled = true;
            cancelTimeout(timeout);
            operation();
            return true;
        };
        const timeout = scheduleTimeout(() => {
            if (!settle(() => rejectJson(new Error(`yt-dlp metadata timed out after ${timeoutMs}ms`)))) return;
            subprocess.kill();
        }, timeoutMs);

        subprocess.stdout.on('data', chunk => {
            if (settled) return;
            const output = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            stdout += stdoutDecoder.write(output);
            stdoutBytes += output.length;
            if (stdoutBytes > maximumBytes) {
                settle(() => rejectJson(new Error(`yt-dlp metadata exceeded ${maximumBytes} bytes`)));
                subprocess.stdout.destroy();
                subprocess.kill();
            }
        });
        subprocess.stderr.on('data', chunk => {
            stderr = `${stderr}${String(chunk)}`.slice(-4_000);
        });
        subprocess.once('error', error => settle(() => rejectJson(error)));
        subprocess.once('close', code => {
            if (settled) return;
            if (code !== 0) {
                settle(() => rejectJson(getYoutubeDlProcessError(stderr, code, 'yt-dlp metadata')));
                return;
            }
            stdout += stdoutDecoder.end();
            try {
                const data = JSON.parse(stdout) as T;
                settle(() => resolveJson(data));
            } catch {
                settle(() => rejectJson(new Error('yt-dlp returned invalid metadata JSON')));
            }
        });
    });
};

export interface YoutubePlaylistMetadataFactoryOptions {
    spawn?: typeof spawn;
    runtime?: YoutubeDlRuntime;
    readJson?: ReturnType<typeof createYoutubeJsonReader>;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    env?: NodeJS.ProcessEnv;
}

export const createYoutubePlaylistMetadataFactory = (options: YoutubePlaylistMetadataFactoryOptions = {}) => {
    const runtime = options.runtime ?? youtubeDlRuntime;
    const readJson = options.readJson ?? createYoutubeJsonReader({
        spawn: options.spawn,
        runtime,
        setTimeout: options.setTimeout,
        clearTimeout: options.clearTimeout,
    });
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const env = options.env ?? process.env;

    return async <T>(url: string): Promise<T> => {
        await runtime.waitForYoutubeDlUpdate();

        const flags: Flags = {
            dumpSingleJson: true,
            flatPlaylist: true,
            jsRuntimes: 'node',
            noWarnings: true,
            skipDownload: true,
        };
        if (env.YOUTUBE_PROXY) flags.proxy = env.YOUTUBE_PROXY;

        const retries = runtime.getYoutubeRetryCount();
        const timeoutMs = runtime.getNumberSetting('YOUTUBE_PLAYLIST_TIMEOUT_MS', 30_000, 5_000, 60_000);
        let lastError: unknown;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await runtime.withYoutubeDlLock(() => readJson<T>(url, flags, timeoutMs));
            } catch (error) {
                lastError = error;
                if (attempt < retries) {
                    await new Promise<void>(resolveRetry => scheduleTimeout(resolveRetry, attempt * 500));
                }
            }
        }

        const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
        throw new Error(`Unable to resolve a YouTube playlist after ${retries} attempts${detail}`);
    };
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

export interface YoutubePlaylistResolverOptions extends YoutubePlaylistMetadataFactoryOptions {
    getMetadata?: ReturnType<typeof createYoutubePlaylistMetadataFactory>;
}

export const createYoutubePlaylistResolver = (options: YoutubePlaylistResolverOptions = {}) => {
    const getMetadata = options.getMetadata ?? createYoutubePlaylistMetadataFactory(options);
    return async (player: Player, url: string, requestedBy: User) => {
        const data = await getMetadata<YoutubePlaylistData>(url);
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
};

export const resolveYoutubePlaylist = createYoutubePlaylistResolver();
