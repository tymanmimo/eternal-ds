import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";

export const previousCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            await interaction.followUp({ content: 'Nothing is playing right now', ephemeral: true });
        } else {
            await interaction.editReply('Nothing is playing right now');
        }
        return false;
    }

    const history = queue.history;

    if (!history.previousTrack) {
        if (interaction.isButton()) {
            await interaction.followUp({ content: 'There is no previous track in the history.', ephemeral: true });
        } else {
            await interaction.editReply('There is no previous track in the history.');
        }
        return false;
    }

    await history.back();
    return true;
}
