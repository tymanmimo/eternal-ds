'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { FakeChildProcess, createManualTimers, createSpawn } = require('../../helpers/fakeChildProcess');
const distRoot = process.env.YOUTUBE_DIST_ROOT || path.resolve(__dirname, '../../../dist');
const { createYoutubeDlRuntime } = require(path.join(distRoot, 'media/youtube/runtime'));
const {
    createYoutubeJsonReader,
    createYoutubePlaylistMetadataFactory,
    createYoutubePlaylistResolver,
    isYoutubePlaylistUrl,
} = require(path.join(distRoot, 'media/youtube/playlist'));

const runtime = overrides => createYoutubeDlRuntime({
    args: () => ['--json'], path: 'fake-yt-dlp', env: { YOUTUBE_STREAM_RETRIES: '1', ...overrides },
});

test('JSON reader resolves valid output and reports sanitized process errors', async () => {
    const success = new FakeChildProcess();
    const failure = new FakeChildProcess();
    const readJson = createYoutubeJsonReader({ spawn: createSpawn(success, failure), runtime: runtime() });
    const result = readJson('playlist', {}, 1000);
    success.stdout.end('{"title":"mix"}');
    success.emit('close', 0);
    assert.deepEqual(await result, { title: 'mix' });
    const rejected = readJson('playlist', {}, 1000);
    failure.stderr.end('bad https://private.example/value');
    failure.emit('close', 2);
    await assert.rejects(rejected, /bad \[url\]/);
});

test('metadata timeout settles without child close and ignores late events', async () => {
    const timers = createManualTimers();
    const child = new FakeChildProcess();
    const readJson = createYoutubeJsonReader({
        spawn: createSpawn(child), runtime: runtime(),
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    });
    const pending = readJson('playlist', {}, 25);
    timers.advance(25);
    await assert.rejects(pending, /metadata timed out after 25ms/);
    assert.equal(child.killed, true);
    child.emit('close', 0);
});

test('metadata limit rejects as soon as output exceeds the cap', async () => {
    const child = new FakeChildProcess();
    const readJson = createYoutubeJsonReader({ spawn: createSpawn(child), runtime: runtime(), maximumBytes: 4 });
    const pending = readJson('playlist', {}, 1000);
    child.stdout.write('12');
    child.stdout.write('345');
    await assert.rejects(pending, /metadata exceeded 4 bytes/);
    assert.equal(child.killed, true);
});

test('JSON reader preserves UTF-8 characters split across output chunks', async () => {
    const child = new FakeChildProcess();
    const prefix = Buffer.from('{"title":"mix ');
    const payload = Buffer.concat([prefix, Buffer.from([0xe2, 0x82, 0xac]), Buffer.from('"}')]);
    const readJson = createYoutubeJsonReader({
        spawn: createSpawn(child), runtime: runtime(), maximumBytes: payload.length,
    });
    const pending = readJson('playlist', {}, 1000);
    child.stdout.write(payload.subarray(0, prefix.length + 1));
    child.stdout.end(payload.subarray(prefix.length + 1));
    child.emit('close', 0);
    assert.deepEqual(await pending, { title: 'mix \u20ac' });
});

test('metadata factory waits, locks, forwards flags, and retries after 500ms', async () => {
    const timers = createManualTimers();
    const calls = [];
    const fakeRuntime = runtime({ YOUTUBE_STREAM_RETRIES: '2', YOUTUBE_PLAYLIST_TIMEOUT_MS: '5000' });
    const originalWait = fakeRuntime.waitForYoutubeDlUpdate;
    fakeRuntime.waitForYoutubeDlUpdate = async () => { calls.push('wait'); await originalWait(); };
    let attempts = 0;
    const metadata = createYoutubePlaylistMetadataFactory({
        runtime: fakeRuntime,
        setTimeout: timers.setTimeout,
        env: { YOUTUBE_PROXY: 'proxy' },
        readJson: async (url, flags, timeout) => {
            calls.push({ url, flags, timeout });
            if (++attempts === 1) throw new Error('temporary');
            return { ok: true };
        },
    });
    const pending = metadata('playlist-url');
    await new Promise(resolve => setImmediate(resolve));
    timers.advance(500);
    assert.deepEqual(await pending, { ok: true });
    assert.equal(calls[0], 'wait');
    assert.equal(calls[1].flags.flatPlaylist, true);
    assert.equal(calls[1].flags.proxy, 'proxy');
    assert.equal(calls[1].timeout, 5000);
    assert.equal(attempts, 2);
});

test('resolver factory uses injected metadata and playlist URL detection is strict', async () => {
    const expected = new Error('metadata unavailable');
    const resolvePlaylist = createYoutubePlaylistResolver({ getMetadata: async () => { throw expected; } });
    await assert.rejects(resolvePlaylist({}, 'url', {}), error => error === expected);
    assert.equal(isYoutubePlaylistUrl('https://www.youtube.com/watch?v=x&list=abc'), true);
    assert.equal(isYoutubePlaylistUrl('https://notyoutube.com/watch?list=abc'), false);
    assert.equal(isYoutubePlaylistUrl('not a URL'), false);
});
