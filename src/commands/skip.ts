import { QueueRepeatMode, useQueue } from "discord-player";
import type { PlayerCommandResult } from "./playerCommandResult";

export const skipCommand = (guildId: string): PlayerCommandResult => {
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
