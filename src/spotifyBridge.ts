import { Readable } from 'node:stream';
import { Player, Track } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import { createYoutubeStream } from './youtubeStream';

const variantTokens = new Set([
    'acoustic',
    'cover',
    'instrumental',
    'karaoke',
    'live',
    'nightcore',
    'remix',
    'reverb',
    'slowed',
    'sped',
]);

const tokenize = (value: string): string[] => {
    return value
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('en-US')
        .match(/[\p{L}\p{N}]+/gu) ?? [];
};

const coverage = (expected: string[], actual: Set<string>) => {
    if (!expected.length) return 0;
    return expected.filter(token => actual.has(token)).length / expected.length;
};

const getMatchScore = (spotifyTrack: Track, youtubeTrack: Track) => {
    const spotifyTitle = tokenize(spotifyTrack.title);
    const youtubeTitle = new Set(tokenize(youtubeTrack.title));
    const spotifyArtist = tokenize(spotifyTrack.author);
    const youtubeIdentity = new Set(tokenize(`${youtubeTrack.author} ${youtubeTrack.title}`));

    const hasUnexpectedVariant = [...variantTokens].some(token => {
        return youtubeTitle.has(token) && !spotifyTitle.includes(token);
    });
    if (hasUnexpectedVariant) return null;

    const titleCoverage = coverage(spotifyTitle, youtubeTitle);
    const artistCoverage = coverage(spotifyArtist, youtubeIdentity);
    if (titleCoverage < 0.8 || artistCoverage < 0.8) return null;

    const durationDifference = Math.abs(spotifyTrack.durationMS - youtubeTrack.durationMS);
    const durationTolerance = Math.max(12_000, spotifyTrack.durationMS * 0.08);
    if (!youtubeTrack.durationMS || durationDifference > durationTolerance) return null;

    const durationScore = 1 - durationDifference / durationTolerance;
    return titleCoverage * 0.55 + artistCoverage * 0.3 + durationScore * 0.15;
};

export const createSpotifyStream = async (
    player: Player,
    track: Track,
): Promise<Readable | null> => {
    if (track.source !== 'spotify') return null;

    const result = await player.search(`${track.author} - ${track.title} official audio`, {
        searchEngine: `ext:${YoutubeExtractor.identifier}`,
        requestedBy: track.requestedBy ?? undefined,
    });

    const candidates = result.tracks
        .map(candidate => ({ candidate, score: getMatchScore(track, candidate) }))
        .filter((entry): entry is { candidate: Track; score: number } => entry.score !== null)
        .sort((left, right) => right.score - left.score);

    for (const { candidate } of candidates) {
        try {
            const stream = await createYoutubeStream(candidate.url, candidate.live);
            track.bridgedTrack = candidate;
            track.bridgedExtractor = candidate.extractor;
            return stream;
        } catch {
            continue;
        }
    }

    throw new Error(`No reliable YouTube match found for Spotify track "${track.author} - ${track.title}"`);
};
