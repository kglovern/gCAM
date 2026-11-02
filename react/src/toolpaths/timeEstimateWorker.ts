export const createTimeEstimateWorker = () =>
    new Worker(new URL('../engine/time-estimate.worker.ts', import.meta.url), {
        type: 'module',
    });
