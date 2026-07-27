import youtubeDl, { Flags } from 'youtube-dl-exec';

const youtubeDlRuntime = youtubeDl as typeof youtubeDl & {
    args: (flags: Flags) => string[];
    constants: { YOUTUBE_DL_PATH: string };
};

export const getYoutubeDlArgs = youtubeDlRuntime.args;
export const youtubeDlPath = youtubeDlRuntime.constants.YOUTUBE_DL_PATH;

let youtubeDlOperation: Promise<void> = Promise.resolve();
let youtubeDlUpdate: Promise<void> | undefined;
let activeYoutubeStreams = 0;

export const withYoutubeDlLock = async <T>(operation: () => Promise<T>): Promise<T> => {
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

export const beginYoutubeStream = () => {
    activeYoutubeStreams++;
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        activeYoutubeStreams--;
    };
};

export const hasActiveYoutubeStreams = () => activeYoutubeStreams > 0;
export const hasYoutubeDlUpdate = () => youtubeDlUpdate !== undefined;

export const setYoutubeDlUpdate = (operation: Promise<void>) => {
    const pendingUpdate = operation.finally(() => {
        if (youtubeDlUpdate === pendingUpdate) youtubeDlUpdate = undefined;
    });
    youtubeDlUpdate = pendingUpdate;
    return pendingUpdate;
};

export const waitForYoutubeDlUpdate = async (timeoutMs?: number) => {
    const pendingUpdate = youtubeDlUpdate;
    if (!pendingUpdate) return;
    if (timeoutMs === undefined) {
        await pendingUpdate;
        return;
    }

    await new Promise<void>((resolveUpdate, rejectUpdate) => {
        const timeout = setTimeout(() => {
            rejectUpdate(new Error('yt-dlp update exceeded the operation deadline'));
        }, timeoutMs);
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
};

export const getYoutubeRetryCount = () => {
    const configuredRetries = Number.parseInt(process.env.YOUTUBE_STREAM_RETRIES ?? '2', 10);
    return Number.isFinite(configuredRetries) ? Math.min(5, Math.max(1, configuredRetries)) : 2;
};

export const getNumberSetting = (name: string, fallback: number, minimum: number, maximum: number) => {
    const configuredValue = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(configuredValue)
        ? Math.min(maximum, Math.max(minimum, configuredValue))
        : fallback;
};

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
