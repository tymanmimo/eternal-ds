const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerActions } = require('../../dist/player/actions') as typeof import('../../src/player/actions');

interface FakeQueue {
    currentTrack: unknown;
    repeatMode: number;
    node: { isPaused: () => boolean; setPaused: (value: boolean) => boolean; skip: () => boolean };
    history: { previousTrack?: unknown; back: () => Promise<unknown> };
    metadata?: { lastMessage?: { delete: () => Promise<unknown> } };
    setRepeatMode: (mode: number) => void;
    delete: () => void;
}

const makeQueue = (overrides: Partial<FakeQueue> = {}): FakeQueue => ({
    currentTrack: { title: 'Song' },
    repeatMode: 0,
    node: { isPaused: () => false, setPaused: () => true, skip: () => true },
    history: { previousTrack: { title: 'Previous' }, back: async () => undefined },
    setRepeatMode(mode: number) { this.repeatMode = mode; },
    delete() {},
    ...overrides,
});

type ActionQueue = NonNullable<ReturnType<Parameters<typeof createPlayerActions>[0]>>;
const asActionQueue = (queue: FakeQueue) => queue as unknown as ActionQueue;
const actionsFor = (queue: FakeQueue | null) => createPlayerActions(
    () => queue ? asActionQueue(queue) : null,
);

test('player actions report an idle queue consistently', async () => {
    const actions = actionsFor(null);
    assert.equal(actions.togglePause('guild').ok, false);
    assert.equal(actions.skipTrack('guild').message, 'Nothing is playing right now');
    assert.equal((await actions.playPreviousTrack('guild')).ok, false);
    assert.equal(actions.toggleTrackRepeat('guild').ok, false);
    assert.equal(actions.stopPlayback('guild').ok, false);
});

test('pause action toggles node state and reports readiness failures', () => {
    let requested: boolean | undefined;
    const queue = makeQueue({ node: { isPaused: () => false, setPaused: value => { requested = value; return true; }, skip: () => true } });
    const actions = actionsFor(queue);
    assert.deepEqual(actions.togglePause('guild'), { ok: true, message: 'Playback paused' });
    assert.equal(requested, true);
    queue.node.setPaused = () => false;
    assert.equal(actions.togglePause('guild').ok, false);
});

test('failed skip restores track repeat mode', () => {
    const modes: number[] = [];
    const queue = makeQueue({
        repeatMode: 1,
        node: { isPaused: () => false, setPaused: () => true, skip: () => false },
        setRepeatMode(mode: number) { modes.push(mode); this.repeatMode = mode; },
    });
    const result = actionsFor(queue).skipTrack('guild');
    assert.equal(result.ok, false);
    assert.deepEqual(modes, [0, 1]);
});

test('successful skip disables track repeat and previous goes back', async () => {
    let backed = false;
    const queue = makeQueue({
        repeatMode: 1,
        history: { previousTrack: {}, back: async () => { backed = true; } },
    });
    const actions = actionsFor(queue);
    assert.equal(actions.skipTrack('guild').ok, true);
    assert.equal(queue.repeatMode, 0);
    assert.equal((await actions.playPreviousTrack('guild')).ok, true);
    assert.equal(backed, true);
});

test('repeat toggles and stop clears metadata before deleting', async () => {
    const events: string[] = [];
    const queue = makeQueue({
        metadata: { lastMessage: { delete: async () => { events.push('message'); } } },
        delete() { events.push(this.metadata?.lastMessage === undefined ? 'queue-cleared' : 'queue-not-cleared'); },
    });
    const actions = actionsFor(queue);
    assert.match(actions.toggleTrackRepeat('guild').message, /enabled/);
    assert.equal(queue.repeatMode, 1);
    assert.equal(actions.stopPlayback('guild').ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['queue-cleared', 'message']);
});
