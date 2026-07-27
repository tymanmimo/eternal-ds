import { useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { createSpotifyStream } from '../spotifyBridge';
import { resolvePlayQuery } from '../playlistResolver';
import { logTiming } from '../performance';

export const playCommand = async (interaction: ChatInputCommandInteraction) => {
    const player = useMainPlayer();
    const query = interaction.options.getString('query', true);
    const member = interaction.member as GuildMember;
    const channel = member.voice.channel;

    if (!channel) return interaction.editReply('First, go to the voice channel');

    const commandStartedAt = performance.now();
    try {
        const searchStartedAt = performance.now();
        const searchResult = await resolvePlayQuery(player, query, interaction.user);
        logTiming('play.search', searchStartedAt);

        const playerStartedAt = performance.now();
        const result = await player.play(channel, searchResult, {
            nodeOptions: {
                metadata: { channel: interaction.channel },
                leaveOnEnd: true,
                leaveOnEmpty: true,
                selfDeaf: true,
                onBeforeCreateStream: track => createSpotifyStream(player, track),
            },
            requestedBy: interaction.user
        });
        logTiming('play.enqueue', playerStartedAt);

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
                .setThumbnail(result.track.bridgedTrack?.thumbnail || result.track.thumbnail)
                .addFields(
                    { name: 'Artist', value: `\`${result.track.author}\``, inline: true },
                    { name: 'Duration', value: `\`${result.track.duration}\``, inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` });
        }

        const response = await interaction.editReply({ embeds: [embed] });
        logTiming('play.command', commandStartedAt);
        return response;

    } catch (e) {
        console.error(e);
        logTiming('play.command', commandStartedAt, 'failed');
        return interaction.editReply('Could not find track or playlist...');
    }
};
