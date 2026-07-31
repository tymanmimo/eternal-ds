const test = require('node:test');
const assert = require('node:assert/strict');

const { createInteractionHandler } = require('../../dist/bot/interactionHandler') as typeof import('../../src/bot/interactionHandler');
const { playerControlIds } = require('../../dist/player/ui') as typeof import('../../src/player/ui');
type HandlerDependencies = Parameters<typeof createInteractionHandler>[0];
type RegisterHandler = ReturnType<typeof createInteractionHandler>;

const ok = { ok: true, message: 'ok' };
type FakeInteraction = ReturnType<typeof command> | ReturnType<typeof button>;
type InteractionListener = (interaction: FakeInteraction) => Promise<void>;

type FakeDependencies = Omit<HandlerDependencies, 'createPlayerControls'> & {
    createPlayerControls: (current: unknown) => unknown;
};

const asControlFactory = (value: FakeDependencies['createPlayerControls']) => value as unknown as HandlerDependencies['createPlayerControls'];
const asClient = (value: object) => value as unknown as Parameters<RegisterHandler>[0];
const asPlayer = (value: object) => value as unknown as Parameters<RegisterHandler>[1];
const asListener = (value: unknown) => value as InteractionListener;
const asCommandResponse = (value: object) => value as unknown as Awaited<ReturnType<HandlerDependencies['playCommand']>>;

const createHarness = (
    overrides: Partial<FakeDependencies> = {},
    queue: { currentTrack: object } | null | (() => { currentTrack: object } | null) = { currentTrack: {} },
) => {
    let handler: InteractionListener = async () => undefined;
    const calls: unknown[][] = [];
    const fakeDependencies: FakeDependencies = {
        playCommand: async interaction => { calls.push(['play', interaction]); return asCommandResponse({}); },
        playPreviousTrack: async guild => { calls.push(['previous', guild]); return ok; },
        skipTrack: guild => { calls.push(['skip', guild]); return ok; },
        stopPlayback: guild => { calls.push(['stop', guild]); return ok; },
        togglePause: guild => { calls.push(['pause', guild]); return ok; },
        toggleTrackRepeat: guild => { calls.push(['repeat', guild]); return ok; },
        createPlayerControls: current => ({ current }),
        logTiming: (...args) => { calls.push(['timing', ...args]); },
        now: () => 50,
        ...overrides,
    };
    const dependencies = {
        ...fakeDependencies,
        createPlayerControls: asControlFactory(fakeDependencies.createPlayerControls),
    } satisfies HandlerDependencies;
    const client = {
        on: (name: string, listener: unknown) => {
            assert.equal(name, 'interactionCreate');
            handler = asListener(listener);
        },
    };
    const player = { nodes: { get: () => typeof queue === 'function' ? queue() : queue } };
    createInteractionHandler(dependencies)(asClient(client), asPlayer(player));
    return { invoke: (interaction: FakeInteraction) => handler(interaction), calls };
};

const command = (name: string, guildId: string | null = 'guild') => {
    const calls: unknown[][] = [];
    return {
        commandName: name,
        guildId,
        deferred: false,
        replied: false,
        isChatInputCommand: () => true,
        isButton: () => false,
        deferReply: async (value?: unknown) => { calls.push(['deferReply', value]); },
        reply: async (value: unknown) => { calls.push(['reply', value]); },
        editReply: async (value: unknown) => { calls.push(['editReply', value]); },
        followUp: async (value: unknown) => { calls.push(['followUp', value]); },
        calls,
    };
};

const button = (customId: string) => {
    const calls: unknown[][] = [];
    const interaction = {
        customId,
        guildId: 'guild',
        deferred: false,
        replied: false,
        isChatInputCommand: () => false,
        isButton: () => true,
        deferUpdate: async () => { interaction.deferred = true; calls.push(['deferUpdate']); },
        update: async (value: unknown) => { interaction.replied = true; calls.push(['update', value]); },
        reply: async (value: unknown) => { interaction.replied = true; calls.push(['reply', value]); },
        followUp: async (value: unknown) => { calls.push(['followUp', value]); },
        calls,
    };
    return interaction;
};

test('interaction routing rejects DMs and acknowledges unknown commands ephemerally', async () => {
    const harness = createHarness();
    const dm = command('pause', null);
    await harness.invoke(dm);
    assert.deepEqual(dm.calls[0], ['reply', { content: 'This command is only available in a server', ephemeral: true }]);

    const unknown = command('mystery');
    await harness.invoke(unknown);
    assert.deepEqual(unknown.calls[0], ['reply', { content: 'Unknown command', ephemeral: true }]);
});

test('interaction routing defers play and previous commands before work', async () => {
    const harness = createHarness();
    const play = command('play');
    await harness.invoke(play);
    assert.equal(play.calls[0][0], 'deferReply');
    assert.equal(harness.calls[0][0], 'play');

    const previous = command('previous');
    await harness.invoke(previous);
    assert.deepEqual(previous.calls, [
        ['deferReply', { ephemeral: true }],
        ['editReply', 'ok'],
    ]);
});

test('button routing updates controls and acknowledges action failures', async () => {
    const harness = createHarness();
    const pause = button(playerControlIds.pauseResume);
    await harness.invoke(pause);
    assert.equal(pause.calls[0][0], 'update');
    assert.equal(harness.calls.at(-1)?.[0], 'timing');

    const failedHarness = createHarness({ skipTrack: () => ({ ok: false, message: 'cannot skip' }) });
    const skip = button(playerControlIds.skip);
    await failedHarness.invoke(skip);
    assert.deepEqual(skip.calls, [
        ['deferUpdate'],
        ['followUp', { content: 'cannot skip', ephemeral: true }],
    ]);
});

test('button routing clears stale controls when the queue is empty', async () => {
    const harness = createHarness({}, null);
    const interaction = button(playerControlIds.pauseResume);
    await harness.invoke(interaction);
    assert.deepEqual(interaction.calls, [['update', { components: [] }]]);
});

test('button routing acknowledges a successful action when the queue becomes empty', async () => {
    let lookup = 0;
    const harness = createHarness({}, () => lookup++ === 0 ? { currentTrack: {} } : null);
    const interaction = button(playerControlIds.pauseResume);
    await harness.invoke(interaction);
    assert.deepEqual(interaction.calls, [['update', { components: [] }]]);
});

test('guild button lock acknowledges concurrent interactions without a second action', async () => {
    let release: () => void = () => undefined;
    let previousCalls = 0;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const harness = createHarness({
        playPreviousTrack: async () => { previousCalls++; await pending; return ok; },
    });
    const first = button(playerControlIds.previous);
    const firstRun = harness.invoke(first);
    await Promise.resolve();
    const second = button(playerControlIds.previous);
    await harness.invoke(second);
    assert.equal(previousCalls, 1);
    assert.deepEqual(second.calls, [['deferUpdate']]);
    release();
    await firstRun;
});

test('button exceptions are acknowledged and logged with failed timing', async () => {
    const harness = createHarness({ togglePause: () => { throw new Error('broken'); } });
    const interaction = button(playerControlIds.pauseResume);
    const originalError = console.error;
    console.error = () => undefined;
    try {
        await harness.invoke(interaction);
    } finally {
        console.error = originalError;
    }
    assert.deepEqual(interaction.calls[0], ['reply', { content: 'Unable to process this control', ephemeral: true }]);
    assert.deepEqual(harness.calls.at(-1), ['timing', `button.${playerControlIds.pauseResume}`, 50, 'failed']);
});
