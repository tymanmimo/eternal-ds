const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerSetup } = require('../../dist/player/setupPlayer') as typeof import('../../src/player/setupPlayer');
type SetupDependencies = Parameters<typeof createPlayerSetup>[0];

type Handler = (...args: unknown[]) => unknown;

interface FakePlayer {
    stream?: (...args: unknown[]) => Promise<string>;
    extractors: {
        loadMulti: (value: unknown) => Promise<void>;
        register: (extractor: unknown, options: { createStream: (...args: unknown[]) => Promise<string> }) => Promise<void>;
    };
    events: { on: (name: string, handler: Handler) => void };
}

const asPlayer = (value: FakePlayer) => value as unknown as ReturnType<SetupDependencies['createPlayer']>;
const asClient = (value: object) => value as unknown as Parameters<SetupDependencies['createPlayer']>[0];
const asDefaultExtractors = (value: unknown[]) => value as unknown as SetupDependencies['defaultExtractors'];
const asYoutubeExtractor = (value: new (...args: never[]) => object) => value as unknown as SetupDependencies['youtubeExtractor'];
const asYoutubeStreamFactory = (value: (...args: unknown[]) => Promise<string>) => {
    return value as unknown as SetupDependencies['createYoutubeStream'];
};

test('player setup loads extractors, stream factory, and event handlers', async () => {
    const calls: unknown[][] = [];
    const handlers = new Map<string, Handler>();
    const player: FakePlayer = {
        extractors: {
            loadMulti: async value => { calls.push(['load', value]); },
            register: async (extractor, options) => { calls.push(['register', extractor]); player.stream = options.createStream; },
        },
        events: { on: (name, handler) => handlers.set(name, handler) },
    };
    class YoutubeExtractor {}
    const dependencies = {
        createPlayer: client => { calls.push(['create', client]); return asPlayer(player); },
        defaultExtractors: asDefaultExtractors(['default']),
        youtubeExtractor: asYoutubeExtractor(YoutubeExtractor),
        createYoutubeStream: asYoutubeStreamFactory(async (...args: unknown[]) => { calls.push(['stream', ...args]); return 'stream'; }),
        handlePlayerStart: async () => undefined,
        handleEmptyQueue: async () => undefined,
        log: (message: string) => { calls.push(['log', message]); },
        error: (message: string) => { calls.push(['error', message]); },
        warn: (message: string) => { calls.push(['warn', message]); },
    } satisfies SetupDependencies;
    const setup = createPlayerSetup(dependencies);
    const client = { id: 'client' };
    assert.equal(await setup(asClient(client)), player);
    assert.deepEqual(calls.slice(0, 3), [['create', client], ['load', ['default']], ['register', YoutubeExtractor]]);
    assert.deepEqual([...handlers.keys()], ['playerStart', 'playerError', 'playerSkip', 'emptyQueue', 'error']);
    const stream = player.stream;
    if (!stream) throw new Error('Stream factory was not registered');
    assert.equal(await stream({ url: 'url', live: true }), 'stream');

    handlers.get('playerError')?.(null, new Error('broken'), { title: 'Song' });
    handlers.get('playerSkip')?.(null, { title: 'Song' }, 'bad', 'details');
    handlers.get('error')?.(null, new Error('queue broken'));
    assert.ok(calls.some(call => call[1] === '[Player Error] Song: broken'));
    assert.ok(calls.some(call => call[1] === '[Player Skip] Song (bad): details'));
    assert.ok(calls.some(call => call[1] === '[Queue Error] queue broken'));
});
