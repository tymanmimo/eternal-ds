export const logTiming = (operation: string, startedAt: number, outcome = 'ok') => {
    if (['0', 'false'].includes((process.env.PERFORMANCE_LOGGING ?? 'true').toLowerCase())) return;
    console.log(`[Timing] ${operation} ${Math.round(performance.now() - startedAt)}ms (${outcome})`);
};
