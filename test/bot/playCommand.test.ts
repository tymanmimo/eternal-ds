const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayCommand } = require('../../dist/bot/playCommand') as typeof import('../../src/bot/playCommand');
type PlayDependencies = Parameters<typeof createPlayCommand>[0];
type PlayCommand = ReturnType<typeof createPlayCommand>;

interface FakeInteraction {
    options: { getString: () => string };
    member: { voice: { channel: { id: string } | null } };
    channel: { id: string };
    user: { username: string };
    editReply: (value: unknown) => Promise<unknown>;
    replies: unknown[];
}

interface EmbedData {
    title?: string;
    footer?: { text: string };
    thumbnail?: { url: string };
    fields?: Array<{ value: string }>;
}

const makeInteraction = (channel: { id: string } | null = { id: 'voice' }): FakeInteraction => {
    const replies: unknown[] = [];
    return {
        options: { getString: () => 'query' },
        member: { voice: { channel } },
        channel: { id: 'text' },
        user: { username: 'listener' },
        editReply: async value => { replies.push(value); return value; },
        replies,
    };
};

const asInteraction = (value: FakeInteraction) => value as unknown as Parameters<PlayCommand>[0];
const asPlayer = (value: object) => value as unknown as ReturnType<PlayDependencies['getPlayer']>;
const asSearchResult = (value: object) => value as unknown as Awaited<ReturnType<PlayDependencies['resolvePlayQuery']>>;
const makeCommand = (dependencies: PlayDependencies) => createPlayCommand(dependencies);

const trackResult = {
    track: { title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00' },
    searchResult: {},
};

test('play command asks users to join voice before resolving', async () => {
    let resolved = false;
    const dependencies = {
        getPlayer: () => asPlayer({}),
        resolvePlayQuery: async () => { resolved = true; return asSearchResult({}); },
        createSpotifyStream: async () => null,
        logTiming: () => undefined,
        now: () => 0,
    } satisfies PlayDependencies;
    const command = makeCommand(dependencies);
    const interaction = makeInteraction(null);
    await command(asInteraction(interaction));
    assert.deepEqual(interaction.replies, ['First, go to the voice channel']);
    assert.equal(resolved, false);
});

test('play command resolves, enqueues, and renders track confirmation', async () => {
    const timings: unknown[][] = [];
    let playArguments: unknown[] = [];
    const player = {
        play: async (...args: unknown[]) => { playArguments = args; return trackResult; },
    };
    const dependencies = {
        getPlayer: () => asPlayer(player),
        resolvePlayQuery: async (actualPlayer, query, user) => {
            assert.equal(actualPlayer, player);
            assert.equal(query, 'query');
            assert.equal(user.username, 'listener');
            return asSearchResult({ tracks: [] });
        },
        createSpotifyStream: async () => null,
        logTiming: (...args) => { timings.push(args); },
        now: () => 10,
    } satisfies PlayDependencies;
    const command = makeCommand(dependencies);
    const interaction = makeInteraction();
    await command(asInteraction(interaction));
    const voice = playArguments[0] as { id: string };
    const options = playArguments[2] as { nodeOptions: { metadata: { channel: { id: string } } } };
    assert.equal(voice.id, 'voice');
    assert.equal(options.nodeOptions.metadata.channel.id, 'text');
    const reply = interaction.replies[0] as { embeds: Array<{ toJSON: () => EmbedData }> };
    const embed = reply.embeds[0]!.toJSON();
    assert.equal(embed.title, 'Song');
    assert.equal(embed.footer?.text, 'Requested by listener');
    assert.deepEqual(timings.map(entry => entry[0]), ['play.search', 'play.enqueue', 'play.command']);
});

test('play command renders playlist details', async () => {
    const result = {
        track: {},
        searchResult: {
            playlist: {
                source: 'spotify', title: 'Playlist', url: 'https://example.com/playlist', thumbnail: 'https://example.com/playlist.jpg',
                tracks: [{ thumbnail: 'https://example.com/first.jpg' }, {}], author: { name: 'Curator' },
            },
        },
    };
    const dependencies = {
        getPlayer: () => asPlayer({ play: async () => result }),
        resolvePlayQuery: async () => asSearchResult({ tracks: [] }),
        createSpotifyStream: async () => null,
        logTiming: () => undefined,
        now: () => 0,
    } satisfies PlayDependencies;
    const command = makeCommand(dependencies);
    const interaction = makeInteraction();
    await command(asInteraction(interaction));
    const reply = interaction.replies[0] as { embeds: Array<{ toJSON: () => EmbedData }> };
    const embed = reply.embeds[0]!.toJSON();
    assert.equal(embed.title, 'Playlist');
    assert.equal(embed.thumbnail?.url, 'https://example.com/first.jpg');
    assert.equal(embed.fields?.[0]?.value, '`2`');
});

test('play command reports failures and records failed timing', async () => {
    const timings: unknown[][] = [];
    const dependencies = {
        getPlayer: () => asPlayer({}),
        resolvePlayQuery: async () => { throw new Error('not found'); },
        createSpotifyStream: async () => null,
        logTiming: (...args) => { timings.push(args); },
        now: () => 1,
    } satisfies PlayDependencies;
    const command = makeCommand(dependencies);
    const interaction = makeInteraction();
    const originalError = console.error;
    console.error = () => undefined;
    try {
        await command(asInteraction(interaction));
    } finally {
        console.error = originalError;
    }
    assert.equal(interaction.replies[0], 'Could not find track or playlist...');
    assert.deepEqual(timings.at(-1), ['play.command', 1, 'failed']);
});
