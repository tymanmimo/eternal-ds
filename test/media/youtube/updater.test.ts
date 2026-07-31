'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
type HelpersModule = {
    FakeChildProcess: import('../../helpers/fakeChildProcess').FakeChildProcessConstructor;
    createManualTimers: import('../../helpers/fakeChildProcess').CreateManualTimers;
    createSpawn: import('../../helpers/fakeChildProcess').CreateSpawn;
};
const { FakeChildProcess, createManualTimers, createSpawn } = require('../../helpers/fakeChildProcess.ts') as HelpersModule;
const distRoot = process.env.YOUTUBE_DIST_ROOT || path.resolve(__dirname, '../../../dist');
const { createYoutubeDlRuntime } = require(path.join(distRoot, 'media/youtube/runtime')) as typeof import('../../../src/media/youtube/runtime');
const {
    createYoutubeDlUpdaterProcess,
    createYoutubeDlUpdaterScheduler,
} = require(path.join(distRoot, 'media/youtube/updater')) as typeof import('../../../src/media/youtube/updater');

type ProcessOptions = Parameters<typeof createYoutubeDlUpdaterProcess>[0];
type SchedulerOptions = Parameters<typeof createYoutubeDlUpdaterScheduler>[0];

const runtime = () => createYoutubeDlRuntime({ args: () => [], path: 'fake-yt-dlp', env: {} });

test('updater process preserves flags and resolves on successful close', async () => {
    const child = new FakeChildProcess();
    const spawn = createSpawn(child);
    const options = { spawn, runtime: runtime() } satisfies ProcessOptions;
    const update = createYoutubeDlUpdaterProcess(options);
    const pending = update();
    child.emit('close', 0);
    await pending;
    assert.equal(spawn.calls[0][0], 'fake-yt-dlp');
    assert.deepEqual(spawn.calls[0][1], ['-U']);
});

test('updater timeout rejects without close and late events are harmless', async () => {
    const timers = createManualTimers();
    const child = new FakeChildProcess();
    const options = {
        spawn: createSpawn(child), runtime: runtime(), timeoutMs: 30,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    } satisfies ProcessOptions;
    const update = createYoutubeDlUpdaterProcess(options);
    const pending = update();
    timers.advance(30);
    await assert.rejects(pending, /yt-dlp update timed out/);
    assert.equal(child.killed, true);
    child.emit('close', 0);
});

test('scheduler skips a current marker and stop cancels its interval', () => {
    const timers = createManualTimers(1000);
    let updates = 0;
    const options = {
        runtime: runtime(), update: async () => { updates++; }, now: timers.now,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval, clearInterval: timers.clearInterval,
        filesystem: { stat: () => ({ mtimeMs: 999 }), mkdir: () => {}, writeFile: () => {} },
        updateIntervalMs: 100,
    } satisfies SchedulerOptions;
    const scheduler = createYoutubeDlUpdaterScheduler(options);
    assert.equal(timers.pending(), 1);
    assert.equal(scheduler.runNow(), undefined);
    scheduler.stop();
    assert.equal(timers.pending(), 0);
    timers.advance(1000);
    assert.equal(updates, 0);
});

test('runNow updates a stale marker and records the injected clock', async () => {
    const timers = createManualTimers(Date.UTC(2025, 0, 2));
    const writes: unknown[][] = [];
    let mkdirPath: string | undefined;
    const options = {
        runtime: runtime(), update: async () => {}, marker: 'state/update-check', now: timers.now,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval, clearInterval: timers.clearInterval,
        filesystem: {
            stat: () => { throw new Error('missing'); },
            mkdir: (path: string) => { mkdirPath = path; },
            writeFile: (...args: unknown[]) => { writes.push(args); },
        },
    } satisfies SchedulerOptions;
    const scheduler = createYoutubeDlUpdaterScheduler(options);
    await scheduler.runNow();
    assert.equal(mkdirPath, 'state');
    assert.deepEqual(writes, [['state/update-check', '2025-01-02T00:00:00.000Z']]);
    scheduler.stop();
});

test('active streams defer updates once and stop cancels retry', () => {
    const timers = createManualTimers();
    const fakeRuntime = runtime();
    const release = fakeRuntime.beginYoutubeStream();
    let updates = 0;
    const options = {
        runtime: fakeRuntime, update: async () => { updates++; }, now: timers.now,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval, clearInterval: timers.clearInterval,
        filesystem: { stat: () => { throw new Error('missing'); }, mkdir: () => {}, writeFile: () => {} },
        initialDelayMs: 10, retryDelayMs: 20,
    } satisfies SchedulerOptions;
    const scheduler = createYoutubeDlUpdaterScheduler(options);
    scheduler.runNow();
    scheduler.runNow();
    assert.equal(timers.pending(), 3);
    scheduler.stop();
    release();
    timers.advance(100);
    assert.equal(updates, 0);
});

test('failed scheduled update warns, leaves the marker untouched, and releases runtime state', async () => {
    const timers = createManualTimers();
    const fakeRuntime = runtime();
    const warnings: string[] = [];
    const writes: unknown[][] = [];
    const options = {
        runtime: fakeRuntime,
        update: async () => { throw new Error('update failed'); },
        now: timers.now,
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval,
        clearInterval: timers.clearInterval,
        warn: (message: string) => { warnings.push(message); },
        filesystem: {
            stat: () => { throw new Error('missing'); },
            mkdir: () => {},
            writeFile: (...args: unknown[]) => { writes.push(args); },
        },
    } satisfies SchedulerOptions;
    const scheduler = createYoutubeDlUpdaterScheduler(options);

    await scheduler.runNow();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(warnings, ['Unable to update yt-dlp; keeping the installed version']);
    assert.deepEqual(writes, []);
    assert.equal(fakeRuntime.hasYoutubeDlUpdate(), false);
    scheduler.stop();
    scheduler.stop();
});

test('updater process reports spawn and non-zero exit failures', async () => {
    const spawnFailure = new FakeChildProcess();
    const exitFailure = new FakeChildProcess();
    const options = {
        spawn: createSpawn(spawnFailure, exitFailure),
        runtime: runtime(),
    } satisfies ProcessOptions;
    const update = createYoutubeDlUpdaterProcess(options);

    const spawnPending = update();
    spawnFailure.emit('error', new Error('spawn failed'));
    await assert.rejects(spawnPending, /spawn failed/);

    const exitPending = update();
    exitFailure.stderr.end('failed https://private.example/value');
    exitFailure.emit('close', 2);
    await assert.rejects(exitPending, /failed \[url\]/);
});
