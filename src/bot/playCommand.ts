import { Player, useMainPlayer } from 'discord-player';
import { ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { resolvePlayQuery } from '../media/resolvePlayQuery';
import { createSpotifyStream } from '../media/spotify/bridge';
import { logTiming } from '../performance';

export interface PlayCommandDependencies {
    getPlayer: typeof useMainPlayer;
    resolvePlayQuery: typeof resolvePlayQuery;
    createSpotifyStream: typeof createSpotifyStream;
    logTiming: typeof logTiming;
    now: () => number;
}

export const createPlayCommand = (dependencies: PlayCommandDependencies) => async (
    interaction: ChatInputCommandInteraction,
    currentPlayer?: Player,
) => {
    const player = currentPlayer ?? dependencies.getPlayer();
    const query = interaction.options.getString('query', true);
    const member = interaction.member as GuildMember;
    const channel = member.voice.channel;

    if (!channel) return interaction.editReply('First, go to the voice channel');

    const commandStartedAt = dependencies.now();
    try {
        const searchStartedAt = dependencies.now();
        const searchResult = await dependencies.resolvePlayQuery(player, query, interaction.user);
        dependencies.logTiming('play.search', searchStartedAt);

        const playerStartedAt = dependencies.now();
        const result = await player.play(channel, searchResult, {
            nodeOptions: {
                metadata: { channel: interaction.channel },
                leaveOnEnd: true,
                leaveOnEmpty: true,
                selfDeaf: true,
                onBeforeCreateStream: track => dependencies.createSpotifyStream(player, track),
            },
            requestedBy: interaction.user,
        });
        dependencies.logTiming('play.enqueue', playerStartedAt);

        const embed = new EmbedBuilder().setColor('#a600ff');
        const playlist = result.searchResult.playlist;

        if (playlist) {
            const isSpotify = playlist.source === 'spotify';
            embed
                .setAuthor({ name: 'Playlist added to queue' })
                .setTitle(playlist.title)
                .setURL(playlist.url)
                .setThumbnail(isSpotify ? (playlist.tracks[0] ? playlist.tracks[0].thumbnail : playlist.thumbnail) : playlist.thumbnail)
                .addFields(
                    { name: 'Tracks', value: `\`${playlist.tracks.length}\``, inline: true },
                    { name: 'Author', value: `\`${playlist.author.name}\``, inline: true },
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
                    { name: 'Duration', value: `\`${result.track.duration}\``, inline: true },
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` });
        }

        const response = await interaction.editReply({ embeds: [embed] });
        dependencies.logTiming('play.command', commandStartedAt);
        return response;
    } catch (error) {
        console.error(error);
        dependencies.logTiming('play.command', commandStartedAt, 'failed');
        return interaction.editReply('Could not find track or playlist...');
    }
};

/* node:coverage disable */
export const playCommand = createPlayCommand({
    getPlayer: useMainPlayer,
    resolvePlayQuery,
    createSpotifyStream,
    logTiming,
    now: () => performance.now(),
});
/* node:coverage enable */
