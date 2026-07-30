'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { FakeChildProcess, createManualTimers, createSpawn } = require('../../helpers/fakeChildProcess');
const distRoot = process.env.YOUTUBE_DIST_ROOT || path.resolve(__dirname, '../../../dist');
const { createYoutubeDlRuntime } = require(path.join(distRoot, 'media/youtube/runtime'));
const { createYoutubeStreamFactory } = require(path.join(distRoot, 'media/youtube/stream'));

const makeRuntime = (timers, retries = '1') => createYoutubeDlRuntime({
    args: flags => Object.keys(flags).sort(),
    path: 'fake-yt-dlp',
    env: {
        YOUTUBE_PREBUFFER_KB: '16',
        YOUTUBE_STARTUP_TIMEOUT_MS: '3000',
        YOUTUBE_TOTAL_TIMEOUT_MS: '5000',
        YOUTUBE_STREAM_RETRIES: retries,
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
});

test('startup timeout rejects and releases stream without close', async () => {
    const timers = createManualTimers();
    const runtime = makeRuntime(timers);
    const child = new FakeChildProcess();
    const createStream = createYoutubeStreamFactory({
        spawn: createSpawn(child), runtime, now: timers.now,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, warn: () => {},
    });
    const stream = createStream('https://example.test/video');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.hasActiveYoutubeStreams(), true);
    timers.advance(3000);
    await assert.rejects(stream, /Unable to start.*did not produce audio within 3000ms/);
    assert.equal(child.killed, true);
    assert.equal(runtime.hasActiveYoutubeStreams(), false);
    child.emit('close', 0);
    assert.equal(runtime.hasActiveYoutubeStreams(), false);
});

test('successful close with buffered audio resolves and preserves spawn flags', async () => {
    const timers = createManualTimers();
    const runtime = makeRuntime(timers);
    const child = new FakeChildProcess();
    const spawn = createSpawn(child);
    const timings = [];
    const createStream = createYoutubeStreamFactory({
        spawn, runtime, now: timers.now, timingNow: () => 42, setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout, logTiming: (...args) => timings.push(args), env: { YOUTUBE_PROXY: 'proxy' },
    });
    const pending = createStream('video-url');
    await new Promise(resolve => setImmediate(resolve));
    child.stdout.write('audio');
    await new Promise(resolve => setImmediate(resolve));
    child.emit('close', 0);
    const stream = await pending;
    assert.equal(stream.read().toString(), 'audio');
    assert.equal(spawn.calls[0][0], 'fake-yt-dlp');
    assert.equal(spawn.calls[0][1][0], 'video-url');
    assert.equal(spawn.calls[0][1].includes('proxy'), true);
    assert.deepEqual(timings, [['youtube.streamReady', 42]]);
    assert.equal(runtime.hasActiveYoutubeStreams(), false);
});

test('spawn error rejects immediately and late close is harmless', async () => {
    const timers = createManualTimers();
    const runtime = makeRuntime(timers);
    const child = new FakeChildProcess();
    const createStream = createYoutubeStreamFactory({
        spawn: createSpawn(child), runtime, now: timers.now,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, warn: () => {},
    });
    const pending = createStream('video');
    await new Promise(resolve => setImmediate(resolve));
    child.emit('error', new Error('spawn failed'));
    await assert.rejects(pending, /Unable to start.*spawn failed/);
    child.emit('close', 1);
    assert.equal(runtime.hasActiveYoutubeStreams(), false);
});

test('failed attempt retries after the existing linear delay', async () => {
    const timers = createManualTimers();
    const runtime = makeRuntime(timers, '2');
    const first = new FakeChildProcess();
    const second = new FakeChildProcess();
    const spawn = createSpawn(first, second);
    const warnings = [];
    const createStream = createYoutubeStreamFactory({
        spawn, runtime, now: timers.now, setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout, warn: message => warnings.push(message),
    });
    const pending = createStream('video');
    await new Promise(resolve => setImmediate(resolve));
    first.stderr.write('first failure');
    first.emit('close', 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(spawn.calls.length, 1);
    timers.advance(499);
    assert.equal(spawn.calls.length, 1);
    timers.advance(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(spawn.calls.length, 2);
    second.emit('error', new Error('second failure'));
    await assert.rejects(pending, /second failure/);
    assert.equal(warnings.length, 2);
});
