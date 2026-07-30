const test = require('node:test');
const assert = require('node:assert/strict');

const { createTimingLogger } = require('../../dist/performance');

test('timing logger rounds elapsed time and includes outcome', () => {
    const messages = [];
    const logTiming = createTimingLogger({ now: () => 112.6, write: message => messages.push(message), enabled: () => true });
    logTiming('search', 100, 'failed');
    assert.deepEqual(messages, ['[Timing] search 13ms (failed)']);
});

test('timing logger does no work when disabled', () => {
    let nowCalled = false;
    const messages = [];
    const logTiming = createTimingLogger({
        now: () => { nowCalled = true; return 1; },
        write: message => messages.push(message),
        enabled: () => false,
    });
    logTiming('search', 0);
    assert.equal(nowCalled, false);
    assert.deepEqual(messages, []);
});
