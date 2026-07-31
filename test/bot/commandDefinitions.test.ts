const test = require('node:test');
const assert = require('node:assert/strict');

const { commandDefinitions, commandNames } = require('../../dist/bot/commandDefinitions') as typeof import('../../src/bot/commandDefinitions');

test('command definitions expose every command with unique names', () => {
    assert.deepEqual(commandNames, {
        play: 'play', pause: 'pause', skip: 'skip', previous: 'previous', repeat: 'repeat', stop: 'stop',
    });
    assert.deepEqual(commandDefinitions.map(command => command.name), Object.values(commandNames));
    assert.equal(new Set(commandDefinitions.map(command => command.name)).size, commandDefinitions.length);
});

test('play command requires a string query and all commands have descriptions', () => {
    const play = commandDefinitions.find(command => command.name === commandNames.play);
    if (!play?.options) throw new Error('Play command definition is missing options');
    assert.ok(commandDefinitions.every(command => command.description));
    assert.equal(play.options.length, 1);
    assert.equal(play.options[0].name, 'query');
    assert.equal(play.options[0].type, 3);
    assert.equal(play.options[0].required, true);
});
