import youtubeDl, { Flags } from 'youtube-dl-exec';

const youtubeDlModule = youtubeDl as typeof youtubeDl & {
    args: (flags: Flags) => string[];
    constants: { YOUTUBE_DL_PATH: string };
};

export interface YoutubeDlRuntimeOptions {
    args?: (flags: Flags) => string[];
    path?: string;
    env?: NodeJS.ProcessEnv;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
}

export const createYoutubeDlRuntime = (options: YoutubeDlRuntimeOptions = {}) => {
    const getArgs = options.args ?? youtubeDlModule.args;
    const path = options.path ?? youtubeDlModule.constants.YOUTUBE_DL_PATH;
    const env = options.env ?? process.env;
    const scheduleTimeout = options.setTimeout ?? setTimeout;
    const cancelTimeout = options.clearTimeout ?? clearTimeout;
    let operationTail: Promise<void> = Promise.resolve();
    let update: Promise<void> | undefined;
    let activeStreams = 0;

    const withLock = async <T>(operation: () => Promise<T>): Promise<T> => {
        const previousOperation = operationTail;
        let release: () => void = () => undefined;
        operationTail = new Promise<void>(resolveOperation => {
            release = resolveOperation;
        });

        await previousOperation;
        try {
            return await operation();
        } finally {
            release();
        }
    };

    const beginStream = () => {
        activeStreams++;
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            activeStreams--;
        };
    };

    const setUpdate = (operation: Promise<void>) => {
        const pendingUpdate = operation.finally(() => {
            if (update === pendingUpdate) update = undefined;
        });
        update = pendingUpdate;
        return pendingUpdate;
    };

    const waitForUpdate = async (timeoutMs?: number) => {
        const pendingUpdate = update;
        if (!pendingUpdate) return;
        if (timeoutMs === undefined) {
            await pendingUpdate;
            return;
        }

        await new Promise<void>((resolveUpdate, rejectUpdate) => {
            const timeout = scheduleTimeout(() => {
                rejectUpdate(new Error('yt-dlp update exceeded the operation deadline'));
            }, timeoutMs);
            pendingUpdate.then(
                () => {
                    cancelTimeout(timeout);
                    resolveUpdate();
                },
                error => {
                    cancelTimeout(timeout);
                    rejectUpdate(error);
                },
            );
            timeout.unref?.();
        });
    };

    const getNumberSetting = (name: string, fallback: number, minimum: number, maximum: number) => {
        const configuredValue = Number.parseInt(env[name] ?? '', 10);
        return Number.isFinite(configuredValue)
            ? Math.min(maximum, Math.max(minimum, configuredValue))
            : fallback;
    };

    return {
        getYoutubeDlArgs: getArgs,
        youtubeDlPath: path,
        withYoutubeDlLock: withLock,
        beginYoutubeStream: beginStream,
        hasActiveYoutubeStreams: () => activeStreams > 0,
        hasYoutubeDlUpdate: () => update !== undefined,
        setYoutubeDlUpdate: setUpdate,
        waitForYoutubeDlUpdate: waitForUpdate,
        getYoutubeRetryCount: () => {
            const configuredRetries = Number.parseInt(env.YOUTUBE_STREAM_RETRIES ?? '2', 10);
            return Number.isFinite(configuredRetries) ? Math.min(5, Math.max(1, configuredRetries)) : 2;
        },
        getNumberSetting,
    };
};

export type YoutubeDlRuntime = ReturnType<typeof createYoutubeDlRuntime>;
export const youtubeDlRuntime = createYoutubeDlRuntime();

export const getYoutubeDlArgs = youtubeDlRuntime.getYoutubeDlArgs;
export const youtubeDlPath = youtubeDlRuntime.youtubeDlPath;
export const withYoutubeDlLock = youtubeDlRuntime.withYoutubeDlLock;
export const beginYoutubeStream = youtubeDlRuntime.beginYoutubeStream;
export const hasActiveYoutubeStreams = youtubeDlRuntime.hasActiveYoutubeStreams;
export const hasYoutubeDlUpdate = youtubeDlRuntime.hasYoutubeDlUpdate;
export const setYoutubeDlUpdate = youtubeDlRuntime.setYoutubeDlUpdate;
export const waitForYoutubeDlUpdate = youtubeDlRuntime.waitForYoutubeDlUpdate;
export const getYoutubeRetryCount = youtubeDlRuntime.getYoutubeRetryCount;
export const getNumberSetting = youtubeDlRuntime.getNumberSetting;

export const sanitizeYoutubeDlError = (value: string) => {
    return value
        .replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-500);
};

export const getYoutubeDlProcessError = (stderr: string, code: number | null, operation: string) => {
    return new Error(sanitizeYoutubeDlError(stderr) || `${operation} exited with code ${code}`);
};
