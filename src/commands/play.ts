import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';

export const playCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const query = interaction.options.getString('query', true);
    const member = interaction.member as GuildMember;
    const channel = member.voice.channel;

    if (!channel) return interaction.editReply('First, go to the voice channel');

    try {
        const result = await player.play(channel, query, {
            nodeOptions: {
                metadata: { channel: interaction.channel },
                leaveOnEnd: true,
                leaveOnEmpty: true,
                selfDeaf: true,
            },
            requestedBy: interaction.user
        });

        const embed = new EmbedBuilder().setColor('#a600ff');
        const playlist = result.searchResult.playlist;

        if (playlist) {
            embed
                .setAuthor({ name: 'Playlist added to queue' })
                .setTitle(playlist.title)
                .setURL(playlist.url)
                .setThumbnail(playlist.thumbnail)
                .addFields(
                    { name: 'Tracks', value: `\`${playlist.tracks.length}\``, inline: true },
                    { name: 'Author', value: `\`${playlist.author.name}\``, inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` });
        } else {
            embed
                .setAuthor({ name: 'Track added to queue' })
                .setTitle(result.track.title)
                .setURL(result.track.url)
                .setThumbnail(result.track.thumbnail)
                .addFields(
                    { name: 'Artist', value: `\`${result.track.author}\``, inline: true },
                    { name: 'Duration', value: `\`${result.track.duration}\``, inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` });
        }

        return interaction.editReply({ embeds: [embed] });

    } catch (e) {
        console.error(e);
        return interaction.editReply('Could not find track or playlist...');
    }
};