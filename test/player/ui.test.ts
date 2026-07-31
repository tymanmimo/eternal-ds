const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerControls, handleEmptyQueue, handlePlayerStart, playerControlIds } = require('../../dist/player/ui') as typeof import('../../src/player/ui');

interface FakeQueue {
    node: { isPaused: () => boolean };
    repeatMode: number;
    metadata?: FakeMetadata;
}

interface FakeMessage {
    id?: string;
    edit?: (payload: unknown) => Promise<unknown>;
}

interface FakeMetadata {
    channel?: { send: (payload: unknown) => Promise<FakeMessage> };
    lastMessage?: FakeMessage;
}

interface FakeTrack {
    title: string;
    url: string;
    thumbnail: string;
    author: string;
    duration: string;
    requestedBy?: { username: string; displayAvatarURL: () => string };
}

const queue = (paused = false, repeatMode = 0): FakeQueue => ({ node: { isPaused: () => paused }, repeatMode });
const asQueue = (value: FakeQueue) => value as unknown as Parameters<typeof createPlayerControls>[0];
const asTrack = (value: FakeTrack) => value as unknown as Parameters<typeof handlePlayerStart>[1];
interface ButtonData { custom_id: string; label?: string; style: number }

test('player controls have stable IDs and reflect pause/repeat state', () => {
    const idle = createPlayerControls(asQueue(queue())).toJSON().components as ButtonData[];
    assert.deepEqual(idle.map(button => button.custom_id), Object.values(playerControlIds));
    assert.equal(idle[1].label, '⏸');
    assert.equal(idle[3].style, 2);

    const active = createPlayerControls(asQueue(queue(true, 1))).toJSON().components as ButtonData[];
    assert.equal(active[1].label, '▶');
    assert.equal(active[3].style, 1);
});

test('player start sends a now-playing message without an undefined requester footer', async () => {
    let sent: unknown;
    const metadata: FakeMetadata = { channel: { send: async payload => { sent = payload; return { id: 'message' }; } } };
    const fakeQueue = { ...queue(), metadata };
    await handlePlayerStart(asQueue(fakeQueue), asTrack({
        title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00',
    }));
    const payload = sent as { embeds: Array<{ toJSON: () => { title?: string; footer?: unknown } }> };
    const embed = payload.embeds[0]!.toJSON();
    assert.equal(embed.title, 'SONG');
    assert.equal(embed.footer, undefined);
    assert.equal(metadata.lastMessage?.id, 'message');
});

test('player start edits the prior message and falls back to send after edit failure', async () => {
    let sends = 0;
    const metadata: FakeMetadata = {
        channel: { send: async () => { sends++; return { id: 'new' }; } },
        lastMessage: { edit: async () => { throw new Error('deleted'); } },
    };
    await handlePlayerStart(asQueue({ ...queue(), metadata }), asTrack({
        title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00',
        requestedBy: { username: 'listener', displayAvatarURL: () => 'https://example.com/avatar.jpg' },
    }));
    assert.equal(sends, 1);
    assert.equal(metadata.lastMessage?.id, 'new');
});

test('empty queue removes controls and tolerates missing messages', async () => {
    let payload: unknown;
    await handleEmptyQueue(asQueue({ ...queue(), metadata: { lastMessage: { edit: async value => { payload = value; } } } }));
    assert.deepEqual(payload, { components: [] });
    await handleEmptyQueue(asQueue({ ...queue(), metadata: {} }));
});
