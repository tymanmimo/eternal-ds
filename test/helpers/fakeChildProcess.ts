'use strict';

const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

class FakeChildProcess extends EventEmitter {
    stdout: InstanceType<typeof PassThrough>;
    stderr: InstanceType<typeof PassThrough>;
    killed: boolean;
    killCalls: number;

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

type SpawnArguments = [command: string, args?: readonly string[], options?: unknown];
type NodeSpawn = typeof import('node:child_process').spawn;

type FakeSpawn = NodeSpawn & {
    calls: SpawnArguments[];
};

const asNodeSpawn = (spawn: (...args: SpawnArguments) => FakeChildProcess): NodeSpawn => {
    return spawn as unknown as NodeSpawn;
};

const createSpawn = (...children: FakeChildProcess[]): FakeSpawn => {
    const calls: SpawnArguments[] = [];
    const spawn = (...args: SpawnArguments) => {
        calls.push(args);
        const child = children.shift();
        if (!child) throw new Error('No fake child process queued');
        return child;
    };
    return Object.assign(asNodeSpawn(spawn), { calls });
};

type TimerCallback = (...args: unknown[]) => void;
type ManualScheduler = (callback: TimerCallback, delay?: number, ...args: unknown[]) => ManualTimer;
type ManualClear = (timer?: ManualTimer) => void;

interface ManualTimer {
    id: number;
    at: number;
    callback: TimerCallback;
    delay: number;
    repeat: boolean;
    args: unknown[];
    unref: () => ManualTimer;
}

interface ManualTimers {
    now: () => number;
    setTimeout: typeof globalThis.setTimeout;
    clearTimeout: typeof globalThis.clearTimeout;
    setInterval: typeof globalThis.setInterval;
    clearInterval: typeof globalThis.clearInterval;
    advance: (milliseconds: number) => void;
    pending: () => number;
}

const asNodeSetTimeout = (schedule: ManualScheduler) => schedule as unknown as typeof globalThis.setTimeout;
const asNodeSetInterval = (schedule: ManualScheduler) => schedule as unknown as typeof globalThis.setInterval;
const asNodeClearTimer = (clear: ManualClear) => clear as unknown as typeof globalThis.clearTimeout;

const createManualTimers = (start = 0): ManualTimers => {
    let now = start;
    let nextId = 1;
    const timers = new Map<number, ManualTimer>();
    const schedule = (callback: TimerCallback, delay: number, repeat: boolean, args: unknown[]) => {
        const timer: ManualTimer = {
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
    const scheduleTimeout = (callback: TimerCallback, delay = 0, ...args: unknown[]) => {
        return schedule(callback, delay, false, args);
    };
    const scheduleInterval = (callback: TimerCallback, delay = 0, ...args: unknown[]) => {
        return schedule(callback, delay, true, args);
    };
    const clear = (timer?: ManualTimer) => {
        if (timer) timers.delete(timer.id);
    };
    const advance = (milliseconds: number) => {
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
        setTimeout: asNodeSetTimeout(scheduleTimeout),
        clearTimeout: asNodeClearTimer(clear),
        setInterval: asNodeSetInterval(scheduleInterval),
        clearInterval: asNodeClearTimer(clear),
        advance,
        pending: () => timers.size,
    };
};

export type FakeChildProcessConstructor = typeof FakeChildProcess;
export type CreateSpawn = typeof createSpawn;
export type CreateManualTimers = typeof createManualTimers;

module.exports = { FakeChildProcess, createManualTimers, createSpawn };
