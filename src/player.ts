import { Player } from 'discord-player';
import { Client, TextChannel } from 'discord.js';
import { DefaultExtractors } from '@discord-player/extractor';

export const setupPlayer = async (client: Client) => {
    const player = new Player(client, {
        skipFFmpeg: false
    });

    await player.extractors.loadMulti(DefaultExtractors);

    player.events.on('playerStart', (queue, track) => {
        const metadata = queue.metadata as { channel: TextChannel };
        metadata.channel.send(`Playing now: **${track.author + ' - ' + track.title}**`);
    });

    player.events.on('playerError', (queue, error) => {
        console.error(`[Player Error] ${error.message}`);
    });

    console.log('Sound engine <3');
    return player;
};