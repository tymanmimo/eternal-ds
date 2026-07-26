import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";

export const pauseCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);
    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            await interaction.followUp({ content: 'Nothing is playing right now', ephemeral: true });
        } else {
            await interaction.editReply('Nothing is playing right now');
        }
        return false;
    }
    queue.node.setPaused(!queue.node.isPaused());
    return true;
};
