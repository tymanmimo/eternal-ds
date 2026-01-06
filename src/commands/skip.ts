import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction } from 'discord.js';

export const skipCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const queue = player.nodes.get(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        return interaction.reply('Nothing is playing that I could skip.');
    }

    const currentTrack = queue.currentTrack;
    queue.node.skip();

    return interaction.reply(`Skipped: **${currentTrack?.author + ' - ' + currentTrack?.title}**`);
};