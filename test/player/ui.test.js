const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerControls, handleEmptyQueue, handlePlayerStart, playerControlIds } = require('../../dist/player/ui');

const queue = (paused = false, repeatMode = 0) => ({ node: { isPaused: () => paused }, repeatMode });

test('player controls have stable IDs and reflect pause/repeat state', () => {
    const idle = createPlayerControls(queue()).toJSON().components;
    assert.deepEqual(idle.map(button => button.custom_id), Object.values(playerControlIds));
    assert.equal(idle[1].label, '⏸');
    assert.equal(idle[3].style, 2);

    const active = createPlayerControls(queue(true, 1)).toJSON().components;
    assert.equal(active[1].label, '▶');
    assert.equal(active[3].style, 1);
});

test('player start sends a now-playing message without an undefined requester footer', async () => {
    let sent;
    const metadata = { channel: { send: async payload => { sent = payload; return { id: 'message' }; } } };
    const fakeQueue = { ...queue(), metadata };
    await handlePlayerStart(fakeQueue, {
        title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00',
    });
    const embed = sent.embeds[0].toJSON();
    assert.equal(embed.title, 'SONG');
    assert.equal(embed.footer, undefined);
    assert.equal(metadata.lastMessage.id, 'message');
});

test('player start edits the prior message and falls back to send after edit failure', async () => {
    let sends = 0;
    const metadata = {
        channel: { send: async () => { sends++; return { id: 'new' }; } },
        lastMessage: { edit: async () => { throw new Error('deleted'); } },
    };
    await handlePlayerStart({ ...queue(), metadata }, {
        title: 'Song', url: 'https://example.com/song', thumbnail: 'https://example.com/thumb.jpg', author: 'Artist', duration: '1:00',
        requestedBy: { username: 'listener', displayAvatarURL: () => 'https://example.com/avatar.jpg' },
    });
    assert.equal(sends, 1);
    assert.equal(metadata.lastMessage.id, 'new');
});

test('empty queue removes controls and tolerates missing messages', async () => {
    let payload;
    await handleEmptyQueue({ metadata: { lastMessage: { edit: async value => { payload = value; } } } });
    assert.deepEqual(payload, { components: [] });
    await handleEmptyQueue({ metadata: {} });
});
