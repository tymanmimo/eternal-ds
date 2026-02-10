import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction } from 'discord.js';

export const skipCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const queue = player.nodes.get(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        return interaction.reply('Nothing is playing that I could skip.');
    }
    queue.node.skip();
};