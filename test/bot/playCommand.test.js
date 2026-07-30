const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayCommand } = require('../../dist/bot/playCommand');

const makeInteraction = (channel = { id: 'voice' }) => {
    const replies = [];
    return {
        options: { getString: () => 'query' },
        member: { voice: { channel } },
        channel: { id: 'text' },
        user: { username: 'listener' },
        editReply: async value => { replies.push(value); return value; },
        replies,
    };
};

const trackResult = {
    track: { title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00' },
    searchResult: {},
};

test('play command asks users to join voice before resolving', async () => {
    let resolved = false;
    const command = createPlayCommand({
        getPlayer: () => ({}),
        resolvePlayQuery: async () => { resolved = true; },
        createSpotifyStream: async () => null,
        logTiming: () => undefined,
        now: () => 0,
    });
    const interaction = makeInteraction(null);
    await command(interaction);
    assert.deepEqual(interaction.replies, ['First, go to the voice channel']);
    assert.equal(resolved, false);
});

test('play command resolves, enqueues, and renders track confirmation', async () => {
    const timings = [];
    let playArguments;
    const player = {
        play: async (...args) => { playArguments = args; return trackResult; },
    };
    const command = createPlayCommand({
        getPlayer: () => player,
        resolvePlayQuery: async (actualPlayer, query, user) => {
            assert.equal(actualPlayer, player);
            assert.equal(query, 'query');
            assert.equal(user.username, 'listener');
            return { tracks: [] };
        },
        createSpotifyStream: async () => null,
        logTiming: (...args) => timings.push(args),
        now: () => 10,
    });
    const interaction = makeInteraction();
    await command(interaction);
    assert.equal(playArguments[0].id, 'voice');
    assert.equal(playArguments[2].nodeOptions.metadata.channel.id, 'text');
    const embed = interaction.replies[0].embeds[0].toJSON();
    assert.equal(embed.title, 'Song');
    assert.equal(embed.footer.text, 'Requested by listener');
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
    const command = createPlayCommand({
        getPlayer: () => ({ play: async () => result }),
        resolvePlayQuery: async () => ({ tracks: [] }),
        createSpotifyStream: async () => null,
        logTiming: () => undefined,
        now: () => 0,
    });
    const interaction = makeInteraction();
    await command(interaction);
    const embed = interaction.replies[0].embeds[0].toJSON();
    assert.equal(embed.title, 'Playlist');
    assert.equal(embed.thumbnail.url, 'https://example.com/first.jpg');
    assert.equal(embed.fields[0].value, '`2`');
});

test('play command reports failures and records failed timing', async () => {
    const timings = [];
    const command = createPlayCommand({
        getPlayer: () => ({}),
        resolvePlayQuery: async () => { throw new Error('not found'); },
        createSpotifyStream: async () => null,
        logTiming: (...args) => timings.push(args),
        now: () => 1,
    });
    const interaction = makeInteraction();
    const originalError = console.error;
    console.error = () => undefined;
    try {
        await command(interaction);
    } finally {
        console.error = originalError;
    }
    assert.equal(interaction.replies[0], 'Could not find track or playlist...');
    assert.deepEqual(timings.at(-1), ['play.command', 1, 'failed']);
});
