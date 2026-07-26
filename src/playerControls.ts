import { GuildQueue, QueueRepeatMode } from 'discord-player';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const createPlayerControls = (queue: GuildQueue, disabled = false) => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('⏮')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('pause_resume')
            .setLabel(queue.node.isPaused() ? '▶' : '⏸')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('skip')
            .setLabel('⏭')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('repeat_track')
            .setLabel('⟳')
            .setStyle(queue.repeatMode === QueueRepeatMode.TRACK ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('stop')
            .setLabel('⊘')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
};
