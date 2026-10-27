export const createGcodePreviewWorker = () =>
    new Worker(new URL('../engine/gcode-preview.worker.ts', import.meta.url), {
        type: 'module',
    });
