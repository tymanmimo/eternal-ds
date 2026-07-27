import { QueueRepeatMode, useQueue } from 'discord-player';
import type { PlayerCommandResult } from './playerCommandResult';

export const repeatCommand = (guildId: string): PlayerCommandResult => {
    const queue = useQueue(guildId);

    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }

    const enabled = queue.repeatMode !== QueueRepeatMode.TRACK;
    queue.setRepeatMode(enabled ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF);
    return { ok: true, message: `Current track repeat ${enabled ? 'enabled' : 'disabled'}` };
};
