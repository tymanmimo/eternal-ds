import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';
import { Flags } from 'youtube-dl-exec';
import { logTiming } from '../../performance';
import {
    beginYoutubeStream,
    getNumberSetting,
    getYoutubeDlArgs,
    getYoutubeRetryCount,
    sanitizeYoutubeDlError,
    waitForYoutubeDlUpdate,
    youtubeDlPath,
} from './runtime';

const createYoutubeStreamAttempt = async (url: string, timeoutMs: number): Promise<Readable> => {
    const prebufferBytes = getNumberSetting('YOUTUBE_PREBUFFER_KB', 128, 16, 1024) * 1024;
    const flags: Flags = {
        format: 'bestaudio[acodec=opus][abr<=160]/bestaudio[acodec=opus]/bestaudio[ext=m4a][abr<=160]/bestaudio',
        jsRuntimes: 'node',
        noPlaylist: true,
        noWarnings: true,
        output: '-',
        quiet: true,
    };
    if (process.env.YOUTUBE_PROXY) flags.proxy = process.env.YOUTUBE_PROXY;

    const releaseStream = beginYoutubeStream();
    const startedAt = performance.now();
    const subprocess = spawn(
        youtubeDlPath,
        [url, ...getYoutubeDlArgs(flags)],
        {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        },
    );
    const output = new PassThrough({ highWaterMark: prebufferBytes });
    let stderr = '';
    let processClosed = false;
    let startupTimedOut = false;

    subprocess.stderr.on('data', chunk => {
        stderr = `${stderr}${String(chunk)}`.slice(-4_000);
    });
    subprocess.stdout.pipe(output, { end: false });
    subprocess.once('close', code => {
        processClosed = true;
        releaseStream();
        if (startupTimedOut) {
            output.destroy(new Error(`yt-dlp did not produce audio within ${timeoutMs}ms`));
        } else if (code === 0) {
            if (output.readableLength > 0) resolveWhenBuffered(true);
            output.end();
        } else if (!output.destroyed) {
            const detail = sanitizeYoutubeDlError(stderr);
            output.destroy(new Error(detail || `yt-dlp exited with code ${code}`));
        }
    });
    subprocess.once('error', error => {
        releaseStream();
        output.destroy(error);
    });
    output.once('close', () => {
        if (!processClosed) subprocess.kill();
    });

    let resolveWhenBuffered: (force?: boolean) => void = () => undefined;
    return new Promise<Readable>((resolveStream, rejectStream) => {
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            startupTimedOut = true;
            subprocess.kill();
        }, timeoutMs);

        resolveWhenBuffered = (force = false) => {
            if (settled || (!force && output.readableLength < prebufferBytes)) return;
            settled = true;
            clearTimeout(timeout);
            output.off('readable', resolveWhenBuffered);
            logTiming('youtube.streamReady', startedAt);
            resolveStream(output);
        };
        const rejectBeforeReady = (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            output.off('readable', resolveWhenBuffered);
            rejectStream(error);
        };

        output.on('readable', resolveWhenBuffered);
        output.once('error', rejectBeforeReady);
        subprocess.once('close', code => {
            if (!settled) {
                const detail = sanitizeYoutubeDlError(stderr);
                rejectBeforeReady(new Error(detail || `yt-dlp exited with code ${code}`));
            }
        });
    });
};

export const createYoutubeStream = async (url: string, _live = false): Promise<Readable> => {
    const retries = getYoutubeRetryCount();
    const totalTimeoutMs = getNumberSetting('YOUTUBE_TOTAL_TIMEOUT_MS', 25_000, 5_000, 60_000);
    const attemptTimeoutMs = getNumberSetting('YOUTUBE_STARTUP_TIMEOUT_MS', 12_000, 3_000, 30_000);
    const deadline = Date.now() + totalTimeoutMs;
    let lastError: unknown;

    await waitForYoutubeDlUpdate(totalTimeoutMs);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const remainingTime = deadline - Date.now();
            if (remainingTime <= 0) break;
            return await createYoutubeStreamAttempt(url, Math.min(attemptTimeoutMs, remainingTime));
        } catch (error) {
            lastError = error;
            const detail = error instanceof Error ? error.message : String(error);
            console.warn(`[YouTube] Stream attempt ${attempt}/${retries} failed: ${sanitizeYoutubeDlError(detail)}`);

            const retryDelay = Math.min(attempt * 500, Math.max(0, deadline - Date.now()));
            if (attempt < retries && retryDelay > 0) {
                await new Promise(resolveRetry => setTimeout(resolveRetry, retryDelay));
            }
        }
    }

    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`Unable to start an anonymous YouTube stream after ${retries} attempts${detail}`);
};
