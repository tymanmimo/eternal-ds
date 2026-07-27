import { DefaultExtractors } from '@discord-player/extractor';
import { Player } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { Client } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { createYoutubeStream } from '../media/youtube/stream';
import { handleEmptyQueue, handlePlayerStart } from './ui';

export const setupPlayer = async (client: Client) => {
    const player = new Player(client, {
        skipFFmpeg: false,
        ffmpegPath: ffmpegPath as string,
    });

    await player.extractors.loadMulti(DefaultExtractors);
    await player.extractors.register(YoutubeExtractor, {
        createStream: track => createYoutubeStream(track.url, track.live),
    });

    player.events.on('playerStart', handlePlayerStart);
    player.events.on('playerError', (_queue, error, track) => {
        console.error(`[Player Error] ${track.title}: ${error.message}`);
    });
    player.events.on('playerSkip', (_queue, track, reason, description) => {
        console.warn(`[Player Skip] ${track.title} (${reason}): ${description}`);
    });
    player.events.on('emptyQueue', handleEmptyQueue);
    player.events.on('error', (_queue, error) => {
        console.error(`[Queue Error] ${error.message}`);
    });

    console.log('Discord Player Engine <3');
    return player;
};
