import { spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import youtubeDl, { Flags } from 'youtube-dl-exec';
import { logTiming } from './performance';

const youtubeDlRuntime = youtubeDl as typeof youtubeDl & {
    args: (flags: Flags) => string[];
    constants: { YOUTUBE_DL_PATH: string };
};
const getYoutubeDlArgs = youtubeDlRuntime.args;
const youtubeDlPath = youtubeDlRuntime.constants.YOUTUBE_DL_PATH;

let youtubeDlOperation: Promise<void> = Promise.resolve();
let youtubeDlUpdate: Promise<void> | undefined;
let activeYoutubeStreams = 0;

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

const getYoutubeRetryCount = () => {
    const configuredRetries = Number.parseInt(process.env.YOUTUBE_STREAM_RETRIES ?? '2', 10);
    return Number.isFinite(configuredRetries) ? Math.min(5, Math.max(1, configuredRetries)) : 2;
};

const getNumberSetting = (name: string, fallback: number, minimum: number, maximum: number) => {
    const configuredValue = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(configuredValue)
        ? Math.min(maximum, Math.max(minimum, configuredValue))
        : fallback;
};

const sanitizeError = (value: string) => {
    return value
        .replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-500);
};

const getProcessError = (stderr: string, code: number | null, operation: string) => {
    return new Error(sanitizeError(stderr) || `${operation} exited with code ${code}`);
};

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
                settle(() => rejectJson(getProcessError(stderr, code, 'yt-dlp metadata')));
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

    activeYoutubeStreams++;
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
    let streamCounted = true;
    const releaseStream = () => {
        if (!streamCounted) return;
        streamCounted = false;
        activeYoutubeStreams--;
    };
    const output = new PassThrough({ highWaterMark: prebufferBytes });
    let stderr = '';
    let processClosed = false;
    let startupTimedOut = false;

    subprocess.stderr?.on('data', chunk => {
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
            const detail = sanitizeError(stderr);
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
                const detail = sanitizeError(stderr);
                rejectBeforeReady(new Error(detail || `yt-dlp exited with code ${code}`));
            }
        });
    });
};

const updateYoutubeDl = () => {
    return new Promise<void>((resolveUpdate, rejectUpdate) => {
        const subprocess = spawn(youtubeDlPath, ['-U'], {
            shell: false,
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });
        let stderr = '';
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            subprocess.kill();
        }, 30_000);

        subprocess.stderr.on('data', chunk => {
            stderr = `${stderr}${String(chunk)}`.slice(-4_000);
        });
        subprocess.once('error', error => {
            clearTimeout(timeout);
            rejectUpdate(error);
        });
        subprocess.once('close', code => {
            clearTimeout(timeout);
            if (timedOut) rejectUpdate(new Error('yt-dlp update timed out'));
            else if (code === 0) resolveUpdate();
            else rejectUpdate(new Error(sanitizeError(stderr) || `yt-dlp update exited with code ${code}`));
        });
    });
};

export const getYoutubePlaylistMetadata = async <T>(url: string): Promise<T> => {
    if (youtubeDlUpdate) await youtubeDlUpdate;

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

export const createYoutubeStream = async (url: string, _live = false): Promise<Readable> => {
    const retries = getYoutubeRetryCount();
    const totalTimeoutMs = getNumberSetting('YOUTUBE_TOTAL_TIMEOUT_MS', 25_000, 5_000, 60_000);
    const attemptTimeoutMs = getNumberSetting('YOUTUBE_STARTUP_TIMEOUT_MS', 12_000, 3_000, 30_000);
    const deadline = Date.now() + totalTimeoutMs;
    let lastError: unknown;

    if (youtubeDlUpdate) {
        const pendingUpdate = youtubeDlUpdate;
        await new Promise<void>((resolveUpdate, rejectUpdate) => {
            const timeout = setTimeout(() => {
                rejectUpdate(new Error('yt-dlp update exceeded the stream startup deadline'));
            }, totalTimeoutMs);
            pendingUpdate.then(
                () => {
                    clearTimeout(timeout);
                    resolveUpdate();
                },
                error => {
                    clearTimeout(timeout);
                    rejectUpdate(error);
                },
            );
            timeout.unref();
        });
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const remainingTime = deadline - Date.now();
            if (remainingTime <= 0) break;
            return await createYoutubeStreamAttempt(url, Math.min(attemptTimeoutMs, remainingTime));
        } catch (error) {
            lastError = error;
            const detail = error instanceof Error ? error.message : String(error);
            console.warn(`[YouTube] Stream attempt ${attempt}/${retries} failed: ${sanitizeError(detail)}`);

            const retryDelay = Math.min(attempt * 500, Math.max(0, deadline - Date.now()));
            if (attempt < retries && retryDelay > 0) {
                await new Promise(resolveRetry => setTimeout(resolveRetry, retryDelay));
            }
        }
    }

    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`Unable to start an anonymous YouTube stream after ${retries} attempts${detail}`);
};

export const startYoutubeDlUpdater = () => {
    if (['0', 'false'].includes((process.env.YOUTUBE_DL_AUTO_UPDATE ?? 'true').toLowerCase())) return;

    const updateInterval = 24 * 60 * 60 * 1000;
    const updateMarker = resolve('.data/yt-dlp-update-check');
    let retryTimer: NodeJS.Timeout | undefined;
    const markerIsCurrent = () => {
        try {
            return Date.now() - statSync(updateMarker).mtimeMs < updateInterval;
        } catch {
            return false;
        }
    };
    const runUpdate = () => {
        if (markerIsCurrent()) return;
        if (activeYoutubeStreams > 0 || youtubeDlUpdate) {
            if (!retryTimer) {
                retryTimer = setTimeout(() => {
                    retryTimer = undefined;
                    runUpdate();
                }, 60_000);
                retryTimer.unref();
            }
            return;
        }

        youtubeDlUpdate = withYoutubeDlLock(async () => {
            await updateYoutubeDl();
            mkdirSync(dirname(updateMarker), { recursive: true });
            writeFileSync(updateMarker, new Date().toISOString());
        }).catch(() => {
            console.warn('Unable to update yt-dlp; keeping the installed version');
        }).finally(() => {
            youtubeDlUpdate = undefined;
        });
    };

    if (!markerIsCurrent()) {
        const initialUpdate = setTimeout(runUpdate, 5 * 60_000);
        initialUpdate.unref();
    }

    const timer = setInterval(runUpdate, updateInterval);
    timer.unref();
};
