const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerActions } = require('../../dist/player/actions');

const makeQueue = (overrides = {}) => ({
    currentTrack: { title: 'Song' },
    repeatMode: 0,
    node: { isPaused: () => false, setPaused: () => true, skip: () => true },
    history: { previousTrack: { title: 'Previous' }, back: async () => undefined },
    setRepeatMode(mode) { this.repeatMode = mode; },
    delete() {},
    ...overrides,
});

test('player actions report an idle queue consistently', async () => {
    const actions = createPlayerActions(() => null);
    assert.equal(actions.togglePause('guild').ok, false);
    assert.equal(actions.skipTrack('guild').message, 'Nothing is playing right now');
    assert.equal((await actions.playPreviousTrack('guild')).ok, false);
    assert.equal(actions.toggleTrackRepeat('guild').ok, false);
    assert.equal(actions.stopPlayback('guild').ok, false);
});

test('pause action toggles node state and reports readiness failures', () => {
    let requested;
    const queue = makeQueue({ node: { isPaused: () => false, setPaused: value => { requested = value; return true; }, skip: () => true } });
    const actions = createPlayerActions(() => queue);
    assert.deepEqual(actions.togglePause('guild'), { ok: true, message: 'Playback paused' });
    assert.equal(requested, true);
    queue.node.setPaused = () => false;
    assert.equal(actions.togglePause('guild').ok, false);
});

test('failed skip restores track repeat mode', () => {
    const modes = [];
    const queue = makeQueue({
        repeatMode: 1,
        node: { isPaused: () => false, setPaused: () => true, skip: () => false },
        setRepeatMode(mode) { modes.push(mode); this.repeatMode = mode; },
    });
    const result = createPlayerActions(() => queue).skipTrack('guild');
    assert.equal(result.ok, false);
    assert.deepEqual(modes, [0, 1]);
});

test('successful skip disables track repeat and previous goes back', async () => {
    let backed = false;
    const queue = makeQueue({
        repeatMode: 1,
        history: { previousTrack: {}, back: async () => { backed = true; } },
    });
    const actions = createPlayerActions(() => queue);
    assert.equal(actions.skipTrack('guild').ok, true);
    assert.equal(queue.repeatMode, 0);
    assert.equal((await actions.playPreviousTrack('guild')).ok, true);
    assert.equal(backed, true);
});

test('repeat toggles and stop clears metadata before deleting', async () => {
    const events = [];
    const queue = makeQueue({
        metadata: { lastMessage: { delete: async () => { events.push('message'); } } },
        delete() { events.push(this.metadata.lastMessage === undefined ? 'queue-cleared' : 'queue-not-cleared'); },
    });
    const actions = createPlayerActions(() => queue);
    assert.match(actions.toggleTrackRepeat('guild').message, /enabled/);
    assert.equal(queue.repeatMode, 1);
    assert.equal(actions.stopPlayback('guild').ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['queue-cleared', 'message']);
});
