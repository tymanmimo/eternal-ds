import { GuildQueue, QueueRepeatMode, Track } from 'discord-player';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Message,
    TextChannel,
} from 'discord.js';

export interface PlayerMetadata {
    channel: TextChannel;
    lastMessage?: Message;
}

export const playerControlIds = {
    previous: 'previous',
    pauseResume: 'pause_resume',
    skip: 'skip',
    repeatTrack: 'repeat_track',
    stop: 'stop',
} as const;

export const createPlayerControls = (queue: GuildQueue) => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(playerControlIds.previous)
            .setLabel('⏮')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(playerControlIds.pauseResume)
            .setLabel(queue.node.isPaused() ? '▶' : '⏸')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(playerControlIds.skip)
            .setLabel('⏭')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(playerControlIds.repeatTrack)
            .setLabel('⟳')
            .setStyle(queue.repeatMode === QueueRepeatMode.TRACK ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(playerControlIds.stop)
            .setLabel('⊘')
            .setStyle(ButtonStyle.Danger),
    );
};

export const handlePlayerStart = async (queue: GuildQueue, track: Track) => {
    const metadata = queue.metadata as PlayerMetadata;
    if (!metadata?.channel) return;

    const embed = new EmbedBuilder()
        .setTitle(track.title.toUpperCase())
        .setURL(track.url)
        .setThumbnail(track.bridgedTrack?.thumbnail || track.thumbnail)
        .addFields(
            { name: 'Artist', value: `\`${track.author}\``, inline: true },
            { name: 'Duration', value: `\`${track.duration}\``, inline: true },
        )
        .setColor('#a600ff');
    if (track.requestedBy?.username) {
        embed.setFooter({
            text: `Ordered by ${track.requestedBy?.username}`,
            iconURL: track.requestedBy?.displayAvatarURL(),
        });
    }
    const messagePayload = { embeds: [embed], components: [createPlayerControls(queue)] };

    if (metadata.lastMessage) {
        try {
            await metadata.lastMessage.edit(messagePayload);
            return;
        } catch {
            metadata.lastMessage = undefined;
        }
    }

    metadata.lastMessage = await metadata.channel.send(messagePayload);
};

export const handleEmptyQueue = async (queue: GuildQueue) => {
    const metadata = queue.metadata as PlayerMetadata;
    await metadata?.lastMessage?.edit({ components: [] }).catch(() => undefined);
};
