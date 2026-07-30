export interface TimingDependencies {
    now: () => number;
    write: (message: string) => void;
    enabled: () => boolean;
}

export const createTimingLogger = (dependencies: TimingDependencies) => {
    return (operation: string, startedAt: number, outcome = 'ok') => {
        if (!dependencies.enabled()) return;
        dependencies.write(`[Timing] ${operation} ${Math.round(dependencies.now() - startedAt)}ms (${outcome})`);
    };
};

/* node:coverage disable */
export const logTiming = createTimingLogger({
    now: () => performance.now(),
    write: message => console.log(message),
    enabled: () => !['0', 'false'].includes((process.env.PERFORMANCE_LOGGING ?? 'true').toLowerCase()),
});
/* node:coverage enable */
