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

export const createSpotifyStream = async (
    player: Player,
    track: Track,
): Promise<Readable | null> => {
    if (track.source !== 'spotify') return null;

    const matchKey = getSpotifyMatchKey(track);
    const cachedMatch = spotifyMatchCache.get(matchKey);
    if (cachedMatch && cachedMatch.expiresAt <= Date.now()) {
        spotifyMatchCache.delete(matchKey);
    }
    if (cachedMatch && cachedMatch.expiresAt > Date.now()) {
        try {
            const stream = await createYoutubeStream(cachedMatch.candidate.url, cachedMatch.candidate.live);
            track.bridgedTrack = cachedMatch.candidate;
            track.bridgedExtractor = cachedMatch.candidate.extractor;
            return stream;
        } catch {
            spotifyMatchCache.delete(matchKey);
        }
    }

    const searchStartedAt = performance.now();
    const result = await player.search(`${track.author} - ${track.title} official audio`, {
        searchEngine: `ext:${YoutubeExtractor.identifier}`,
        requestedBy: track.requestedBy ?? undefined,
    });
    logTiming('spotify.youtubeSearch', searchStartedAt);

    const candidates = result.tracks
        .map(candidate => ({ candidate, score: getSpotifyMatchScore(track, candidate) }))
        .filter((entry): entry is { candidate: Track; score: number } => entry.score !== null)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

    for (const { candidate } of candidates) {
        try {
            const stream = await createYoutubeStream(candidate.url, candidate.live);
            track.bridgedTrack = candidate;
            track.bridgedExtractor = candidate.extractor;
            if (spotifyMatchCache.size >= 500) {
                const oldestKey = spotifyMatchCache.keys().next().value;
                if (oldestKey) spotifyMatchCache.delete(oldestKey);
            }
            spotifyMatchCache.set(matchKey, {
                candidate,
                expiresAt: Date.now() + spotifyMatchCacheTtl,
            });
            return stream;
        } catch {
            continue;
        }
    }

    throw new Error(`No reliable YouTube match found for Spotify track "${track.author} - ${track.title}"`);
};
