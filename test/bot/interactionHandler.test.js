const test = require('node:test');
const assert = require('node:assert/strict');

const { createInteractionHandler } = require('../../dist/bot/interactionHandler');
const { playerControlIds } = require('../../dist/player/ui');

const ok = { ok: true, message: 'ok' };
const createHarness = (overrides = {}, queue = { currentTrack: {} }) => {
    let handler;
    const calls = [];
    const dependencies = {
        playCommand: async interaction => calls.push(['play', interaction]),
        playPreviousTrack: async guild => { calls.push(['previous', guild]); return ok; },
        skipTrack: guild => { calls.push(['skip', guild]); return ok; },
        stopPlayback: guild => { calls.push(['stop', guild]); return ok; },
        togglePause: guild => { calls.push(['pause', guild]); return ok; },
        toggleTrackRepeat: guild => { calls.push(['repeat', guild]); return ok; },
        createPlayerControls: current => ({ current }),
        logTiming: (...args) => calls.push(['timing', ...args]),
        now: () => 50,
        ...overrides,
    };
    createInteractionHandler(dependencies)(
        { on: (name, listener) => { assert.equal(name, 'interactionCreate'); handler = listener; } },
        { nodes: { get: () => typeof queue === 'function' ? queue() : queue } },
    );
    return { invoke: interaction => handler(interaction), calls };
};

const command = (name, guildId = 'guild') => {
    const calls = [];
    return {
        commandName: name,
        guildId,
        deferred: false,
        replied: false,
        isChatInputCommand: () => true,
        isButton: () => false,
        deferReply: async value => { calls.push(['deferReply', value]); },
        reply: async value => { calls.push(['reply', value]); },
        editReply: async value => { calls.push(['editReply', value]); },
        followUp: async value => { calls.push(['followUp', value]); },
        calls,
    };
};

const button = customId => {
    const calls = [];
    const interaction = {
        customId,
        guildId: 'guild',
        deferred: false,
        replied: false,
        isChatInputCommand: () => false,
        isButton: () => true,
        deferUpdate: async () => { interaction.deferred = true; calls.push(['deferUpdate']); },
        update: async value => { interaction.replied = true; calls.push(['update', value]); },
        reply: async value => { interaction.replied = true; calls.push(['reply', value]); },
        followUp: async value => { calls.push(['followUp', value]); },
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
    assert.equal(harness.calls.at(-1)[0], 'timing');

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
    let release;
    let previousCalls = 0;
    const pending = new Promise(resolve => { release = resolve; });
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
