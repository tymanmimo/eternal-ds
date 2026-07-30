const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerSetup } = require('../../dist/player/setupPlayer');

test('player setup loads extractors, stream factory, and event handlers', async () => {
    const calls = [];
    const handlers = new Map();
    const player = {
        extractors: {
            loadMulti: async value => calls.push(['load', value]),
            register: async (extractor, options) => { calls.push(['register', extractor]); player.stream = options.createStream; },
        },
        events: { on: (name, handler) => handlers.set(name, handler) },
    };
    class YoutubeExtractor {}
    const setup = createPlayerSetup({
        createPlayer: client => { calls.push(['create', client]); return player; },
        defaultExtractors: ['default'],
        youtubeExtractor: YoutubeExtractor,
        createYoutubeStream: async (...args) => { calls.push(['stream', ...args]); return 'stream'; },
        handlePlayerStart: () => undefined,
        handleEmptyQueue: () => undefined,
        log: message => calls.push(['log', message]),
        error: message => calls.push(['error', message]),
        warn: message => calls.push(['warn', message]),
    });
    const client = { id: 'client' };
    assert.equal(await setup(client), player);
    assert.deepEqual(calls.slice(0, 3), [['create', client], ['load', ['default']], ['register', YoutubeExtractor]]);
    assert.deepEqual([...handlers.keys()], ['playerStart', 'playerError', 'playerSkip', 'emptyQueue', 'error']);
    assert.equal(await player.stream({ url: 'url', live: true }), 'stream');

    handlers.get('playerError')(null, new Error('broken'), { title: 'Song' });
    handlers.get('playerSkip')(null, { title: 'Song' }, 'bad', 'details');
    handlers.get('error')(null, new Error('queue broken'));
    assert.ok(calls.some(call => call[1] === '[Player Error] Song: broken'));
    assert.ok(calls.some(call => call[1] === '[Player Skip] Song (bad): details'));
    assert.ok(calls.some(call => call[1] === '[Queue Error] queue broken'));
});
