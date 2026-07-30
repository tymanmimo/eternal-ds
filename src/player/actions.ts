import { QueueRepeatMode, useQueue } from 'discord-player';
import type { PlayerMetadata } from './ui';

export interface PlayerActionResult {
    ok: boolean;
    message: string;
}

interface ActionQueue {
    currentTrack?: unknown;
    repeatMode: QueueRepeatMode;
    node: {
        isPaused: () => boolean;
        setPaused: (paused: boolean) => boolean;
        skip: () => boolean;
    };
    history: {
        previousTrack?: unknown;
        back: () => Promise<unknown>;
    };
    metadata?: PlayerMetadata;
    setRepeatMode: (mode: QueueRepeatMode) => unknown;
    delete: () => unknown;
}

export const createPlayerActions = (getQueue: (guildId: string) => ActionQueue | null | undefined) => {
    const togglePause = (guildId: string): PlayerActionResult => {
        const queue = getQueue(guildId);
        if (!queue?.currentTrack) {
            return { ok: false, message: 'Nothing is playing right now' };
        }

        const paused = !queue.node.isPaused();
        if (!queue.node.setPaused(paused)) {
            return { ok: false, message: 'Playback is not ready yet' };
        }
        return { ok: true, message: paused ? 'Playback paused' : 'Playback resumed' };
    };

    const skipTrack = (guildId: string): PlayerActionResult => {
        const queue = getQueue(guildId);
        if (!queue?.currentTrack) {
            return { ok: false, message: 'Nothing is playing right now' };
        }

        const restoreTrackRepeat = queue.repeatMode === QueueRepeatMode.TRACK;
        if (restoreTrackRepeat) {
            queue.setRepeatMode(QueueRepeatMode.OFF);
        }
        if (!queue.node.skip()) {
            if (restoreTrackRepeat) queue.setRepeatMode(QueueRepeatMode.TRACK);
            return { ok: false, message: 'Unable to skip the current track' };
        }
        return { ok: true, message: 'Track skipped' };
    };

    const playPreviousTrack = async (guildId: string): Promise<PlayerActionResult> => {
        const queue = getQueue(guildId);
        if (!queue?.currentTrack) {
            return { ok: false, message: 'Nothing is playing right now' };
        }
        if (!queue.history.previousTrack) {
            return { ok: false, message: 'There is no previous track in the history.' };
        }

        await queue.history.back();
        return { ok: true, message: 'Playing the previous track' };
    };

    const toggleTrackRepeat = (guildId: string): PlayerActionResult => {
        const queue = getQueue(guildId);
        if (!queue?.currentTrack) {
            return { ok: false, message: 'Nothing is playing right now' };
        }

        const enabled = queue.repeatMode !== QueueRepeatMode.TRACK;
        queue.setRepeatMode(enabled ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF);
        return { ok: true, message: `Current track repeat ${enabled ? 'enabled' : 'disabled'}` };
    };

    const stopPlayback = (guildId: string): PlayerActionResult => {
        const queue = getQueue(guildId);
        if (!queue?.currentTrack) {
            return { ok: false, message: 'Nothing is playing right now' };
        }

        const metadata = queue.metadata as PlayerMetadata | undefined;
        const lastMessage = metadata?.lastMessage;
        if (metadata) metadata.lastMessage = undefined;
        queue.delete();
        void lastMessage?.delete().catch(() => undefined);
        return { ok: true, message: 'Playback stopped and queue cleared' };
    };

    return { togglePause, skipTrack, playPreviousTrack, toggleTrackRepeat, stopPlayback };
};

/* node:coverage disable */
const playerActions = createPlayerActions(guildId => useQueue(guildId) as unknown as ActionQueue | null);

export const { togglePause, skipTrack, playPreviousTrack, toggleTrackRepeat, stopPlayback } = playerActions;
/* node:coverage enable */
