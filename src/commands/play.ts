import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction, GuildMember } from 'discord.js';

export const playCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const query = interaction.options.getString('query', true);
    const member = interaction.member as GuildMember;
    const channel = member.voice.channel;

    if (!channel) return interaction.editReply('Join the voice channel!');

    try {
        const { track } = await player.play(channel, query, {
            nodeOptions: {
                metadata: { channel: interaction.channel },
                bufferingTimeout: 15000,
                leaveOnEnd: true,
            }
        });

        return interaction.editReply(`Added track: **${track.author + ' - ' + track.title}**`);
    } catch (e) {
        console.error(e);
        return interaction.editReply('Track not found...');
    }
};