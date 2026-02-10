import { Player } from 'discord-player';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Message, TextChannel } from 'discord.js';
import { AppleMusicExtractor, AttachmentExtractor, SoundCloudExtractor, SpotifyExtractor } from '@discord-player/extractor';
import ffmpegPath from 'ffmpeg-static';


interface PlayerMetadata {
    channel: TextChannel;
    lastMessage?: Message;
}

export const setupPlayer = async (client: Client) => {
    const player = new Player(client, {
        skipFFmpeg: false,
        ffmpegPath: ffmpegPath as string,
    });

    // await player.extractors.register(YoutubeiExtractor, {});
    await player.extractors.register(SoundCloudExtractor, {});
    await player.extractors.register(SpotifyExtractor, { bridge: true } as any);
    await player.extractors.register(AppleMusicExtractor, { bridge: true } as any);
    await player.extractors.register(AttachmentExtractor, {});


    player.events.on('playerStart', async(queue, track) => {
        const metadata = queue.metadata as PlayerMetadata;
        if (!metadata?.channel) return;

        if (metadata.lastMessage) {
            try {
                await metadata.lastMessage.delete();
            } catch (error) {
                console.error('Не удалось удалить старое сообщение плеера');
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(track.title.toUpperCase())
            .setURL(track.url)
            .setThumbnail(track.thumbnail)
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('pause_resume')
                .setLabel('⏸')
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

        const message = await metadata.channel.send({ embeds: [embed], components: [row] });
        metadata.lastMessage = message;
    });

    player.events.on('playerError', (queue, error) => {
        console.error(`[Player Error] ${error.message}`);
    });

    player.events.on('error', (queue, error) => {
        console.error(`[Queue Error] ${error.message}`);
    });

    console.log('Discord Player Engine <3');
    return player;
};