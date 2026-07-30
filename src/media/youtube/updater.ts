import { spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sanitizeYoutubeDlError, YoutubeDlRuntime, youtubeDlRuntime } from './runtime';

export interface YoutubeDlUpdaterProcessOptions {
    spawn?: typeof spawn;
    runtime?: YoutubeDlRuntime;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    timeoutMs?: number;
}

export const createYoutubeDlUpdaterProcess = (options: YoutubeDlUpdaterProcessOptions = {}) => {
    const spawnProcess = options.spawn ?? spawn;
    const runtime = options.runtime ?? youtubeDlRuntime;
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const cancelTimeout = options.clearTimeout ?? clearTimeout;
    const timeoutMs = options.timeoutMs ?? 30_000;

    return () => new Promise<void>((resolveUpdate, rejectUpdate) => {
        const subprocess = spawnProcess(runtime.youtubeDlPath, ['-U'], {
            shell: false,
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });
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
            if (!settle(() => rejectUpdate(new Error('yt-dlp update timed out')))) return;
            subprocess.kill();
        }, timeoutMs);

        subprocess.stderr.on('data', chunk => {
            if (!settled) stderr = `${stderr}${String(chunk)}`.slice(-4_000);
        });
        subprocess.once('error', error => settle(() => rejectUpdate(error)));
        subprocess.once('close', code => {
            if (code === 0) settle(resolveUpdate);
            else settle(() => rejectUpdate(new Error(
                sanitizeYoutubeDlError(stderr) || `yt-dlp update exited with code ${code}`,
            )));
        });
    });
};

interface YoutubeUpdaterFileSystem {
    stat: (path: string) => { mtimeMs: number };
    mkdir: (path: string) => void;
    writeFile: (path: string, contents: string) => void;
}

export interface YoutubeDlUpdaterSchedulerOptions {
    runtime?: YoutubeDlRuntime;
    update?: () => Promise<void>;
    filesystem?: YoutubeUpdaterFileSystem;
    now?: () => number;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    warn?: (message: string) => void;
    marker?: string;
    updateIntervalMs?: number;
    initialDelayMs?: number;
    retryDelayMs?: number;
}

export interface YoutubeDlUpdaterController {
    stop: () => void;
    runNow: () => Promise<void> | undefined;
}

export const createYoutubeDlUpdaterScheduler = (
    options: YoutubeDlUpdaterSchedulerOptions = {},
): YoutubeDlUpdaterController => {
    const runtime = options.runtime ?? youtubeDlRuntime;
    const update = options.update ?? createYoutubeDlUpdaterProcess({ runtime });
    const filesystem = options.filesystem ?? {
        stat: (path: string) => statSync(path),
        mkdir: (path: string) => { mkdirSync(path, { recursive: true }); },
        writeFile: (path: string, contents: string) => { writeFileSync(path, contents); },
    };
    const now = options.now ?? (() => Date.now());
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const cancelTimeout = options.clearTimeout ?? clearTimeout;
    const scheduleInterval = options.setInterval ?? setInterval;
    const cancelInterval = options.clearInterval ?? clearInterval;
    const warn = options.warn ?? console.warn;
    const updateInterval = options.updateIntervalMs ?? 24 * 60 * 60 * 1000;
    const updateMarker = options.marker ?? resolve('.data/yt-dlp-update-check');
    const initialDelay = options.initialDelayMs ?? 5 * 60_000;
    const retryDelay = options.retryDelayMs ?? 60_000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let initialTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const markerIsCurrent = () => {
        try {
            return now() - filesystem.stat(updateMarker).mtimeMs < updateInterval;
        } catch {
            return false;
        }
    };
    const runUpdate = (): Promise<void> | undefined => {
        if (stopped || markerIsCurrent()) return;
        if (runtime.hasActiveYoutubeStreams() || runtime.hasYoutubeDlUpdate()) {
            if (!retryTimer) {
                retryTimer = scheduleTimeout(() => {
                    retryTimer = undefined;
                    runUpdate();
                }, retryDelay);
                retryTimer.unref?.();
            }
            return;
        }

        const operation = runtime.withYoutubeDlLock(async () => {
            await update();
            filesystem.mkdir(dirname(updateMarker));
            filesystem.writeFile(updateMarker, new Date(now()).toISOString());
        }).catch(() => {
            warn('Unable to update yt-dlp; keeping the installed version');
        });
        void runtime.setYoutubeDlUpdate(operation);
        return operation;
    };

    if (!markerIsCurrent()) {
        initialTimer = scheduleTimeout(() => {
            initialTimer = undefined;
            runUpdate();
        }, initialDelay);
        initialTimer.unref?.();
    }

    const intervalTimer = scheduleInterval(runUpdate, updateInterval);
    intervalTimer.unref?.();

    return {
        runNow: runUpdate,
        stop: () => {
            if (stopped) return;
            stopped = true;
            if (initialTimer) cancelTimeout(initialTimer);
            if (retryTimer) cancelTimeout(retryTimer);
            cancelInterval(intervalTimer);
            initialTimer = undefined;
            retryTimer = undefined;
        },
    };
};

export const startYoutubeDlUpdater = () => {
    if (['0', 'false'].includes((process.env.YOUTUBE_DL_AUTO_UPDATE ?? 'true').toLowerCase())) return;
    return createYoutubeDlUpdaterScheduler();
};
