/** Vite resolves the worker asset separately from the request lifecycle. */
export const createMeshWorker = () =>
    new Worker(new URL('./engine/mesh-planner.worker.ts', import.meta.url), {
        type: 'module',
    });
