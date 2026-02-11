import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";

export const previousCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            return interaction.editReply({ content: 'Nothing is playing right now', embeds: [], components: [] });
        } else {
            return interaction.reply({ content: 'Nothing is playing right now', ephemeral: true });
        }
    }

    const history = queue.history;

    if (!history.previousTrack) {
        return interaction.reply({ content: 'There is no previous track in the history.', ephemeral: true });
    }

    await history.back();
}