import { QueueRepeatMode, useQueue } from 'discord-player';
import type { PlayerMetadata } from './ui';

export interface PlayerActionResult {
    ok: boolean;
    message: string;
}

export const togglePause = (guildId: string): PlayerActionResult => {
    const queue = useQueue(guildId);
    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }

    const paused = !queue.node.isPaused();
    if (!queue.node.setPaused(paused)) {
        return { ok: false, message: 'Playback is not ready yet' };
    }
    return { ok: true, message: paused ? 'Playback paused' : 'Playback resumed' };
};

export const skipTrack = (guildId: string): PlayerActionResult => {
    const queue = useQueue(guildId);
    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }

    if (queue.repeatMode === QueueRepeatMode.TRACK) {
        queue.setRepeatMode(QueueRepeatMode.OFF);
    }
    if (!queue.node.skip()) {
        return { ok: false, message: 'Unable to skip the current track' };
    }
    return { ok: true, message: 'Track skipped' };
};

export const playPreviousTrack = async (guildId: string): Promise<PlayerActionResult> => {
    const queue = useQueue(guildId);
    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }
    if (!queue.history.previousTrack) {
        return { ok: false, message: 'There is no previous track in the history.' };
    }

    await queue.history.back();
    return { ok: true, message: 'Playing the previous track' };
};

export const toggleTrackRepeat = (guildId: string): PlayerActionResult => {
    const queue = useQueue(guildId);
    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }

    const enabled = queue.repeatMode !== QueueRepeatMode.TRACK;
    queue.setRepeatMode(enabled ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF);
    return { ok: true, message: `Current track repeat ${enabled ? 'enabled' : 'disabled'}` };
};

export const stopPlayback = (guildId: string): PlayerActionResult => {
    const queue = useQueue(guildId);
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
