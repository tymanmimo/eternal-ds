import { spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
    hasActiveYoutubeStreams,
    hasYoutubeDlUpdate,
    sanitizeYoutubeDlError,
    setYoutubeDlUpdate,
    withYoutubeDlLock,
    youtubeDlPath,
} from './runtime';

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
            else rejectUpdate(new Error(sanitizeYoutubeDlError(stderr) || `yt-dlp update exited with code ${code}`));
        });
    });
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
        if (hasActiveYoutubeStreams() || hasYoutubeDlUpdate()) {
            if (!retryTimer) {
                retryTimer = setTimeout(() => {
                    retryTimer = undefined;
                    runUpdate();
                }, 60_000);
                retryTimer.unref();
            }
            return;
        }

        const operation = withYoutubeDlLock(async () => {
            await updateYoutubeDl();
            mkdirSync(dirname(updateMarker), { recursive: true });
            writeFileSync(updateMarker, new Date().toISOString());
        }).catch(() => {
            console.warn('Unable to update yt-dlp; keeping the installed version');
        });
        void setYoutubeDlUpdate(operation);
    };

    if (!markerIsCurrent()) {
        const initialUpdate = setTimeout(runUpdate, 5 * 60_000);
        initialUpdate.unref();
    }

    const timer = setInterval(runUpdate, updateInterval);
    timer.unref();
};
