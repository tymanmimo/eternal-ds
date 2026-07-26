import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { ProxyAgent, request } from 'undici';
import youtubeDl, { Flags, update } from 'youtube-dl-exec';

let youtubeDlOperation: Promise<void> = Promise.resolve();
let proxyAgent: ProxyAgent | undefined;

const withYoutubeDlLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previousOperation = youtubeDlOperation;
    let release: () => void = () => undefined;
    youtubeDlOperation = new Promise<void>(resolveOperation => {
        release = resolveOperation;
    });

    await previousOperation;
    try {
        return await operation();
    } finally {
        release();
    }
};

const getProxyAgent = () => {
    const proxy = process.env.YOUTUBE_PROXY;
    if (!proxy) return undefined;
    proxyAgent ??= new ProxyAgent(proxy);
    return proxyAgent;
};

const getYoutubeRetryCount = () => {
    const configuredRetries = Number.parseInt(process.env.YOUTUBE_STREAM_RETRIES ?? '3', 10);
    return Number.isFinite(configuredRetries) ? Math.min(10, Math.max(1, configuredRetries)) : 3;
};

const openUrlStream = async (url: string, redirects = 0): Promise<Readable> => {
    const response = await request(url, {
        dispatcher: getProxyAgent(),
    });
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        await response.body.dump();
        if (redirects >= 3) throw new Error('Too many YouTube stream redirects');
        const location = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location;
        return openUrlStream(new URL(location, url).toString(), redirects + 1);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump();
        throw new Error(`YouTube stream request failed with status ${response.statusCode}`);
    }
    return response.body;
};

const resolveStreamUrl = async (url: string, live: boolean) => {
    const flags: Flags = {
        format: live ? 'best' : 'bestaudio',
        getUrl: true,
        jsRuntimes: 'node',
        noWarnings: true,
    };
    if (process.env.YOUTUBE_PROXY) flags.proxy = process.env.YOUTUBE_PROXY;

    const result = await youtubeDl(url, flags);
    if (typeof result !== 'string') throw new Error('yt-dlp did not return a YouTube stream URL');

    const streamUrl = result.trim().split(/\r?\n/)[0];
    if (!streamUrl) throw new Error('yt-dlp returned an empty YouTube stream URL');
    return streamUrl;
};

export const getYoutubePlaylistMetadata = async <T>(url: string): Promise<T> => {
    const flags: Flags = {
        dumpSingleJson: true,
        flatPlaylist: true,
        jsRuntimes: 'node',
        noWarnings: true,
        skipDownload: true,
    };
    if (process.env.YOUTUBE_PROXY) flags.proxy = process.env.YOUTUBE_PROXY;

    const retries = getYoutubeRetryCount();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await withYoutubeDlLock(() => youtubeDl(url, flags)) as T;
        } catch {
            if (attempt < retries) {
                await new Promise(resolveRetry => setTimeout(resolveRetry, attempt * 1000));
            }
        }
    }

    throw new Error(`Unable to resolve a YouTube playlist after ${retries} attempts`);
};

export const createYoutubeStream = async (url: string, live = false): Promise<Readable> => {
    const retries = getYoutubeRetryCount();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const streamUrl = await withYoutubeDlLock(() => resolveStreamUrl(url, live));
            return await openUrlStream(streamUrl);
        } catch {
            if (attempt < retries) {
                await new Promise(resolveRetry => setTimeout(resolveRetry, attempt * 1000));
            }
        }
    }

    throw new Error(`Unable to resolve an anonymous YouTube stream after ${retries} attempts`);
};

export const startYoutubeDlUpdater = () => {
    if (['0', 'false'].includes((process.env.YOUTUBE_DL_AUTO_UPDATE ?? 'true').toLowerCase())) return;

    const updateInterval = 24 * 60 * 60 * 1000;
    const updateMarker = resolve('.data/yt-dlp-update-check');
    const runUpdate = () => {
        mkdirSync(dirname(updateMarker), { recursive: true });
        writeFileSync(updateMarker, new Date().toISOString());
        void withYoutubeDlLock(async () => {
            await update();
        }).catch(() => {
            console.warn('Unable to update yt-dlp; keeping the installed version');
        });
    };

    let markerAge = Number.POSITIVE_INFINITY;
    try {
        markerAge = Date.now() - statSync(updateMarker).mtimeMs;
    } catch {
        // The first run has no update marker yet.
    }
    if (markerAge >= updateInterval) runUpdate();

    const timer = setInterval(runUpdate, updateInterval);
    timer.unref();
};
