'use strict';

const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

class FakeChildProcess extends EventEmitter {
    constructor() {
        super();
        this.stdout = new PassThrough();
        this.stderr = new PassThrough();
        this.killed = false;
        this.killCalls = 0;
    }

    kill() {
        this.killed = true;
        this.killCalls++;
        return true;
    }
}

const createSpawn = (...children) => {
    const calls = [];
    const spawn = (...args) => {
        calls.push(args);
        const child = children.shift();
        if (!child) throw new Error('No fake child process queued');
        return child;
    };
    spawn.calls = calls;
    return spawn;
};

const createManualTimers = (start = 0) => {
    let now = start;
    let nextId = 1;
    const timers = new Map();
    const schedule = (callback, delay, repeat, args) => {
        const timer = {
            id: nextId++,
            at: now + Number(delay),
            callback,
            delay: Number(delay),
            repeat,
            args,
            unref() { return timer; },
        };
        timers.set(timer.id, timer);
        return timer;
    };
    const setTimeout = (callback, delay = 0, ...args) => schedule(callback, delay, false, args);
    const setInterval = (callback, delay = 0, ...args) => schedule(callback, delay, true, args);
    const clear = timer => {
        if (timer) timers.delete(timer.id);
    };
    const advance = milliseconds => {
        const target = now + milliseconds;
        while (true) {
            const due = [...timers.values()]
                .filter(timer => timer.at <= target)
                .sort((left, right) => left.at - right.at || left.id - right.id)[0];
            if (!due) break;
            now = due.at;
            if (due.repeat) due.at += due.delay;
            else timers.delete(due.id);
            due.callback(...due.args);
        }
        now = target;
    };
    return {
        now: () => now,
        setTimeout,
        clearTimeout: clear,
        setInterval,
        clearInterval: clear,
        advance,
        pending: () => timers.size,
    };
};

module.exports = { FakeChildProcess, createManualTimers, createSpawn };
