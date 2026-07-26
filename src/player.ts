import ffmpegPath from 'ffmpeg-static';
import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { Client, EmbedBuilder, Message, TextChannel } from 'discord.js';
import { createPlayerControls } from './playerControls';
import { createYoutubeStream } from './youtubeStream';


export interface PlayerMetadata {
    channel: TextChannel;
    lastMessage?: Message;
}

export const setupPlayer = async (client: Client) => {
    const player = new Player(client, {
        skipFFmpeg: false,
        ffmpegPath: ffmpegPath as string,
    });


    await player.extractors.loadMulti(DefaultExtractors);
    await player.extractors.register(YoutubeExtractor, {
        createStream: track => createYoutubeStream(track.url, track.live),
    });

    player.events.on('playerStart', async(queue, track) => {
        const metadata = queue.metadata as PlayerMetadata;
        if (!metadata?.channel) return;

        if (metadata.lastMessage) {
            try {
                await metadata.lastMessage.delete();
            } catch {
                console.error('Failed to delete old player message');
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(track.title.toUpperCase())
            .setURL(track.url)
            .setThumbnail(track.bridgedTrack?.thumbnail || track.thumbnail)
            .addFields(
                {
                    name: 'Artist',
                    value: `\`${track.author}\``,
                    inline: true
                },
                {
                    name: 'Duration',
                    value: `\`${track.duration}\``,
                    inline: true
                }
            )
            .setColor('#a600ff')
            .setFooter({
                text: `Ordered by ${track.requestedBy?.username}`,
                iconURL: track.requestedBy?.displayAvatarURL()
            });

        const row = createPlayerControls(queue);

        const message = await metadata.channel.send({ embeds: [embed], components: [row] });
        metadata.lastMessage = message;
    });

    player.events.on('playerError', (_queue, error, track) => {
        console.error(`[Player Error] ${track.title}: ${error.message}`);
    });

    player.events.on('playerSkip', (_queue, track, reason, description) => {
        console.warn(`[Player Skip] ${track.title} (${reason}): ${description}`);
    });

    player.events.on('error', (_queue, error) => {
        console.error(`[Queue Error] ${error.message}`);
    });

    console.log('Discord Player Engine <3');
    return player;
};
