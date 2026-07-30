import { Readable } from 'node:stream';
import { Player, Track } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { logTiming } from '../../performance';
import { createYoutubeStream } from '../youtube/stream';
import { getSpotifyMatchScore } from './matching';

interface CachedSpotifyMatch {
    candidate: Track;
    expiresAt: number;
}

const spotifyMatchCache = new Map<string, CachedSpotifyMatch>();
const spotifyMatchCacheTtl = 6 * 60 * 60 * 1000;

const getSpotifyMatchKey = (track: Track) => {
    return `${track.author}\u0000${track.title}\u0000${track.durationMS}`.toLocaleLowerCase('en-US');
};

export interface SpotifyBridgeDependencies {
    cache: Map<string, CachedSpotifyMatch>;
    cacheTtl: number;
    now: () => number;
    createStream: typeof createYoutubeStream;
    getMatchScore: typeof getSpotifyMatchScore;
    logTiming: typeof logTiming;
    timingNow?: () => number;
}

export const createSpotifyBridge = (dependencies: SpotifyBridgeDependencies) => async (
    player: Player,
    track: Track,
): Promise<Readable | null> => {
    if (track.source !== 'spotify') return null;

    const matchKey = getSpotifyMatchKey(track);
    const cachedMatch = dependencies.cache.get(matchKey);
    if (cachedMatch && cachedMatch.expiresAt <= dependencies.now()) {
        dependencies.cache.delete(matchKey);
    }
    if (cachedMatch && cachedMatch.expiresAt > dependencies.now()) {
        try {
            const stream = await dependencies.createStream(cachedMatch.candidate.url, cachedMatch.candidate.live);
            track.bridgedTrack = cachedMatch.candidate;
            track.bridgedExtractor = cachedMatch.candidate.extractor;
            return stream;
        } catch {
            dependencies.cache.delete(matchKey);
        }
    }

    const searchStartedAt = (dependencies.timingNow ?? dependencies.now)();
    const result = await player.search(`${track.author} - ${track.title} official audio`, {
        searchEngine: `ext:${YoutubeExtractor.identifier}`,
        requestedBy: track.requestedBy ?? undefined,
    });
    dependencies.logTiming('spotify.youtubeSearch', searchStartedAt);

    const candidates = result.tracks
        .map(candidate => ({ candidate, score: dependencies.getMatchScore(track, candidate) }))
        .filter((entry): entry is { candidate: Track; score: number } => entry.score !== null)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

    for (const { candidate } of candidates) {
        try {
            const stream = await dependencies.createStream(candidate.url, candidate.live);
            track.bridgedTrack = candidate;
            track.bridgedExtractor = candidate.extractor;
            if (dependencies.cache.size >= 500) {
                const oldestKey = dependencies.cache.keys().next().value;
                if (oldestKey) dependencies.cache.delete(oldestKey);
            }
            dependencies.cache.set(matchKey, {
                candidate,
                expiresAt: dependencies.now() + dependencies.cacheTtl,
            });
            return stream;
        } catch {
            continue;
        }
    }

    throw new Error(`No reliable YouTube match found for Spotify track "${track.author} - ${track.title}"`);
};

/* node:coverage disable */
export const createSpotifyStream = createSpotifyBridge({
    cache: spotifyMatchCache,
    cacheTtl: spotifyMatchCacheTtl,
    now: Date.now,
    createStream: createYoutubeStream,
    getMatchScore: getSpotifyMatchScore,
    logTiming,
    timingNow: () => performance.now(),
});
/* node:coverage enable */
