import { useQueue } from "discord-player";
import type { PlayerCommandResult } from "./playerCommandResult";

export const pauseCommand = (guildId: string): PlayerCommandResult => {
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
