import { ChatInputCommandInteraction } from 'discord.js';
import { useQueue } from 'discord-player';

export const pauseCommand = async (interaction: ChatInputCommandInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        return interaction.reply({ content: 'Nothing is playing right now', ephemeral: true });
    }

    queue.node.setPaused(!queue.node.isPaused());
};