import { useQueue } from "discord-player";
import type { PlayerCommandResult } from "./playerCommandResult";

export const previousCommand = async (guildId: string): Promise<PlayerCommandResult> => {
    const queue = useQueue(guildId);

    if (!queue?.currentTrack) {
        return { ok: false, message: 'Nothing is playing right now' };
    }

    const history = queue.history;

    if (!history.previousTrack) {
        return { ok: false, message: 'There is no previous track in the history.' };
    }

    await history.back();
    return { ok: true, message: 'Playing the previous track' };
}
