import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';
import { Flags } from 'youtube-dl-exec';
import { logTiming } from '../../performance';
import { sanitizeYoutubeDlError, YoutubeDlRuntime, youtubeDlRuntime } from './runtime';

export interface YoutubeStreamFactoryOptions {
    spawn?: typeof spawn;
    runtime?: YoutubeDlRuntime;
    now?: () => number;
    timingNow?: () => number;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    logTiming?: (operation: string, startedAt: number) => void;
    warn?: (message: string) => void;
    env?: NodeJS.ProcessEnv;
}

export const createYoutubeStreamFactory = (options: YoutubeStreamFactoryOptions = {}) => {
    const spawnProcess = options.spawn ?? spawn;
    const runtime = options.runtime ?? youtubeDlRuntime;
    const now = options.now ?? (() => Date.now());
    const timingNow = options.timingNow ?? (() => performance.now());
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const cancelTimeout = options.clearTimeout ?? clearTimeout;
    const recordTiming = options.logTiming ?? logTiming;
    const warn = options.warn ?? console.warn;
    const env = options.env ?? process.env;

    const createAttempt = async (url: string, timeoutMs: number): Promise<Readable> => {
        const prebufferBytes = runtime.getNumberSetting('YOUTUBE_PREBUFFER_KB', 128, 16, 1024) * 1024;
        const flags: Flags = {
            format: 'bestaudio[acodec=opus][abr<=160]/bestaudio[acodec=opus]/bestaudio[ext=m4a][abr<=160]/bestaudio',
            jsRuntimes: 'node',
            noPlaylist: true,
            noWarnings: true,
            output: '-',
            quiet: true,
        };
        if (env.YOUTUBE_PROXY) flags.proxy = env.YOUTUBE_PROXY;

        const startedAt = timingNow();
        const subprocess = spawnProcess(runtime.youtubeDlPath, [url, ...runtime.getYoutubeDlArgs(flags)], {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        const releaseStream = runtime.beginYoutubeStream();
        const output = new PassThrough({ highWaterMark: prebufferBytes });
        let stderr = '';
        let processClosed = false;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            releaseStream();
        };

        subprocess.stderr.on('data', chunk => {
            stderr = `${stderr}${String(chunk)}`.slice(-4_000);
        });
        subprocess.stdout.pipe(output, { end: false });

        let resolveWhenBuffered: (force?: boolean) => void = () => undefined;
        const pendingStream = new Promise<Readable>((resolveStream, rejectStream) => {
            let settled = false;
            const settle = (operation: () => void) => {
                if (settled) return false;
                settled = true;
                cancelTimeout(timeout);
                output.off('readable', resolveWhenBuffered);
                operation();
                return true;
            };
            const rejectBeforeReady = (error: Error) => settle(() => rejectStream(error));
            const timeout = scheduleTimeout(() => {
                const error = new Error(`yt-dlp did not produce audio within ${timeoutMs}ms`);
                if (!rejectBeforeReady(error)) return;
                release();
                subprocess.kill();
                output.destroy(error);
            }, timeoutMs);

            resolveWhenBuffered = (force = false) => {
                if (!force && output.readableLength < prebufferBytes) return;
                settle(() => {
                    recordTiming('youtube.streamReady', startedAt);
                    resolveStream(output);
                });
            };

            output.on('readable', resolveWhenBuffered);
            output.once('error', rejectBeforeReady);
            subprocess.once('error', error => {
                release();
                rejectBeforeReady(error);
                output.destroy(error);
            });
            subprocess.once('close', code => {
                processClosed = true;
                release();
                if (code === 0) {
                    if (output.readableLength > 0) resolveWhenBuffered(true);
                    output.end();
                } else if (!output.destroyed) {
                    const detail = sanitizeYoutubeDlError(stderr);
                    output.destroy(new Error(detail || `yt-dlp exited with code ${code}`));
                }
                if (!settled) {
                    const detail = sanitizeYoutubeDlError(stderr);
                    rejectBeforeReady(new Error(detail || `yt-dlp exited with code ${code}`));
                }
            });
        });

        output.once('close', () => {
            release();
            if (!processClosed) subprocess.kill();
        });
        return pendingStream;
    };

    return async (url: string, _live = false): Promise<Readable> => {
        const retries = runtime.getYoutubeRetryCount();
        const totalTimeoutMs = runtime.getNumberSetting('YOUTUBE_TOTAL_TIMEOUT_MS', 25_000, 5_000, 60_000);
        const attemptTimeoutMs = runtime.getNumberSetting('YOUTUBE_STARTUP_TIMEOUT_MS', 12_000, 3_000, 30_000);
        const deadline = now() + totalTimeoutMs;
        let lastError: unknown;

        await runtime.waitForYoutubeDlUpdate(totalTimeoutMs);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const remainingTime = deadline - now();
                if (remainingTime <= 0) break;
                return await createAttempt(url, Math.min(attemptTimeoutMs, remainingTime));
            } catch (error) {
                lastError = error;
                const detail = error instanceof Error ? error.message : String(error);
                warn(`[YouTube] Stream attempt ${attempt}/${retries} failed: ${sanitizeYoutubeDlError(detail)}`);

                const retryDelay = Math.min(attempt * 500, Math.max(0, deadline - now()));
                if (attempt < retries && retryDelay > 0) {
                    await new Promise<void>(resolveRetry => scheduleTimeout(resolveRetry, retryDelay));
                }
            }
        }

        const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
        throw new Error(`Unable to start an anonymous YouTube stream after ${retries} attempts${detail}`);
    };
};

export const createYoutubeStream = createYoutubeStreamFactory();
