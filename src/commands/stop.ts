import { useQueue } from "discord-player";
import { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";

export const stopCommand = async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const queue = useQueue(interaction.guildId!);

    if (!queue || !queue.isPlaying()) {
        if (interaction.isButton()) {
            return interaction.editReply({ content: 'Nothing is playing right now', embeds: [], components: [] });
        } else {
            return interaction.reply({ content: 'Nothing is playing right now', ephemeral: true });
        }
    }

    queue.delete();

    if (interaction.isButton() && interaction.message) {
        await interaction.message.delete();
    } else if (interaction.isChatInputCommand()) {
        const channel = interaction.channel;
        if (channel) {
            try {
                const messages = await channel.messages.fetch({ limit: 10 });
                const botMessages = messages.filter(msg => {
                    return msg.author.id === interaction.client.user.id && msg.components.length > 0 && msg.embeds.length > 0
                });
                for (const message of botMessages.values()) {
                    await message.delete();
                }
            } catch (error) {
                console.error('Error deleting message:', error);
            }
        }
    }
};