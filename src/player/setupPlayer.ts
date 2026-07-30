import { DefaultExtractors } from '@discord-player/extractor';
import { Player } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { Client } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { createYoutubeStream } from '../media/youtube/stream';
import { handleEmptyQueue, handlePlayerStart } from './ui';

export interface SetupPlayerDependencies {
    createPlayer: (client: Client) => Player;
    defaultExtractors: typeof DefaultExtractors;
    youtubeExtractor: typeof YoutubeExtractor;
    createYoutubeStream: typeof createYoutubeStream;
    handlePlayerStart: typeof handlePlayerStart;
    handleEmptyQueue: typeof handleEmptyQueue;
    log: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
}

export const createPlayerSetup = (dependencies: SetupPlayerDependencies) => async (client: Client) => {
    const player = dependencies.createPlayer(client);

    await player.extractors.loadMulti(dependencies.defaultExtractors);
    await player.extractors.register(dependencies.youtubeExtractor, {
        createStream: track => dependencies.createYoutubeStream(track.url, track.live),
    });

    player.events.on('playerStart', dependencies.handlePlayerStart);
    player.events.on('playerError', (_queue, error, track) => {
        dependencies.error(`[Player Error] ${track.title}: ${error.message}`);
    });
    player.events.on('playerSkip', (_queue, track, reason, description) => {
        dependencies.warn(`[Player Skip] ${track.title} (${reason}): ${description}`);
    });
    player.events.on('emptyQueue', dependencies.handleEmptyQueue);
    player.events.on('error', (_queue, error) => {
        dependencies.error(`[Queue Error] ${error.message}`);
    });

    dependencies.log('Discord Player Engine <3');
    return player;
};

/* node:coverage disable */
export const setupPlayer = createPlayerSetup({
    createPlayer: client => new Player(client, {
        skipFFmpeg: false,
        ffmpegPath: ffmpegPath as string,
    }),
    defaultExtractors: DefaultExtractors,
    youtubeExtractor: YoutubeExtractor,
    createYoutubeStream,
    handlePlayerStart,
    handleEmptyQueue,
    log: message => console.log(message),
    error: message => console.error(message),
    warn: message => console.warn(message),
});
/* node:coverage enable */
