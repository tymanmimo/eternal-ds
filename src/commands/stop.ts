import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction } from 'discord.js';

export const stopCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const queue = player.nodes.get(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        return interaction.reply('Nothing is playing right now.');
    }

    queue.delete();
    return interaction.reply(`The bot's work has been completed`);
};