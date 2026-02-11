import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const pauseCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);
    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            return interaction.editReply({ content: 'Nothing is playing right now', embeds: [], components: [] });
        } else {
            return interaction.reply({ content: 'Nothing is playing right now', ephemeral: true });
        }
    }
    queue.node.setPaused(!queue.node.isPaused());

    if (interaction.isButton()) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('⏮')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pause_resume')
                .setLabel(queue.node.isPaused() ? '▶' : '⏸')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('skip')
                .setLabel('⏭')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⊘')
                .setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ components: [row] })
    }
};