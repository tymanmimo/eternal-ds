import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import type { PlayerMetadata } from "../player";

export const stopCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            await interaction.followUp({ content: 'Nothing is playing right now', ephemeral: true });
        } else {
            await interaction.editReply('Nothing is playing right now');
        }
        return false;
    }

    const metadata = queue.metadata as PlayerMetadata | undefined;
    queue.delete();
    await metadata?.lastMessage?.delete().catch(() => undefined);
    return true;
};
