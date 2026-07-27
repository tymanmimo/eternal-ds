import { useQueue } from "discord-player";
import type { PlayerMetadata } from "../player";
import type { PlayerCommandResult } from "./playerCommandResult";

export const stopCommand = (guildId: string): PlayerCommandResult => {
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
