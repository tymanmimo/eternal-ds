import { QueueRepeatMode, useQueue } from 'discord-player';
import { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';

export const repeatCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue?.currentTrack) {
        if (interaction.isButton()) {
            await interaction.followUp({ content: 'Nothing is playing right now', ephemeral: true });
        } else {
            await interaction.editReply('Nothing is playing right now');
        }
        return false;
    }

    const enabled = queue.repeatMode !== QueueRepeatMode.TRACK;
    queue.setRepeatMode(enabled ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF);

    if (interaction.isButton()) {
        return true;
    }

    await interaction.editReply(`Current track repeat ${enabled ? 'enabled' : 'disabled'}`);
    return true;
};
