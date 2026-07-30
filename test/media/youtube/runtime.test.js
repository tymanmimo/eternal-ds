'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createManualTimers } = require('../../helpers/fakeChildProcess');
const distRoot = process.env.YOUTUBE_DIST_ROOT || path.resolve(__dirname, '../../../dist');
const {
    createYoutubeDlRuntime,
    getYoutubeDlProcessError,
    sanitizeYoutubeDlError,
} = require(path.join(distRoot, 'media/youtube/runtime'));

test('runtime exposes injected executable, arguments, and bounded settings', () => {
    const runtime = createYoutubeDlRuntime({
        args: flags => [flags.quiet ? '--quiet' : '--verbose'],
        path: 'fake-yt-dlp',
        env: { YOUTUBE_STREAM_RETRIES: '99', LOW: '-2', HIGH: '30', BAD: 'wat' },
    });
    assert.equal(runtime.youtubeDlPath, 'fake-yt-dlp');
    assert.deepEqual(runtime.getYoutubeDlArgs({ quiet: true }), ['--quiet']);
    assert.equal(runtime.getYoutubeRetryCount(), 5);
    assert.equal(runtime.getNumberSetting('LOW', 4, 1, 10), 1);
    assert.equal(runtime.getNumberSetting('HIGH', 4, 1, 10), 10);
    assert.equal(runtime.getNumberSetting('BAD', 4, 1, 10), 4);
});

test('stream leases are idempotent and isolated per runtime', () => {
    const left = createYoutubeDlRuntime();
    const right = createYoutubeDlRuntime();
    const release = left.beginYoutubeStream();
    assert.equal(left.hasActiveYoutubeStreams(), true);
    assert.equal(right.hasActiveYoutubeStreams(), false);
    release();
    release();
    assert.equal(left.hasActiveYoutubeStreams(), false);
});

test('lock serializes operations and releases after rejection', async () => {
    const runtime = createYoutubeDlRuntime();
    let releaseFirst;
    const order = [];
    const first = runtime.withYoutubeDlLock(async () => {
        order.push('first');
        await new Promise(resolve => { releaseFirst = resolve; });
        throw new Error('failed');
    });
    const second = runtime.withYoutubeDlLock(async () => { order.push('second'); });
    await Promise.resolve();
    assert.deepEqual(order, ['first']);
    releaseFirst();
    await assert.rejects(first, /failed/);
    await second;
    assert.deepEqual(order, ['first', 'second']);
});

test('update state clears on settlement and wait timeout is deterministic', async () => {
    const timers = createManualTimers();
    const runtime = createYoutubeDlRuntime(timers);
    let finish;
    const update = runtime.setYoutubeDlUpdate(new Promise(resolve => { finish = resolve; }));
    assert.equal(runtime.hasYoutubeDlUpdate(), true);
    const wait = runtime.waitForYoutubeDlUpdate(20);
    timers.advance(20);
    await assert.rejects(wait, /exceeded the operation deadline/);
    finish();
    await update;
    assert.equal(runtime.hasYoutubeDlUpdate(), false);
});

test('errors redact URLs, normalize whitespace, and retain exit fallback', () => {
    assert.equal(sanitizeYoutubeDlError('  failed https://secret.example/x\n now  '), 'failed [url] now');
    assert.equal(getYoutubeDlProcessError('', 7, 'metadata').message, 'metadata exited with code 7');
});
