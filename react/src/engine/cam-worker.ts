import { validateToolpaths } from '../cam/gcode-validation.js';
import { processLaserImage } from '../cam/laser.js';
import { exportToolpaths } from '../gcode/exportToolpaths';
/**
 * Purpose: Implementation module for cam-worker in the engine domain.
 */
import * as CamOps from '../cam/cam-ops.js';
import type {
    BuildGcodeRequest,
    BuildToolpathRequest,
    CamWorkerMessage,
    CamWorkerRequest,
} from './cam-worker-protocol';

let clipperReadyPromise: Promise<void> | null = null;
const cancelledRequestIds = new Set<number>();

async function ensureClipper(): Promise<void> {
    if (globalThis.ClipperLib) return;
    if (!clipperReadyPromise) {
        clipperReadyPromise = import('./clipper-shim.js').then(() => undefined);
    }
    await clipperReadyPromise;
    if (!globalThis.ClipperLib) {
        throw new Error('ClipperLib failed to initialize in worker.');
    }
}

function post(message: CamWorkerMessage): void {
    self.postMessage(message);
}

function postProgress(id: number, percent: number, label: string): void {
    if (!cancelledRequestIds.has(id))
        post({ id, progress: { percent, label } });
}

async function buildToolpath(data: BuildToolpathRequest): Promise<unknown> {
    const { id, selectedLoops, config } = data;
    const { validateResult, ...toolpathOptions } = data.toolpathOptions;
    postProgress(id, 8, 'Preparing toolpath');
    const options = {
        ...toolpathOptions,
        sourceEntities: config.sourceEntities,
        onProgress: ((percent: number, label: string) =>
            postProgress(id, percent, label)) as unknown as () => void,
    };
    const result = await CamOps.createToolpathFromLoopsAsync(
        selectedLoops,
        String(config.operation).startsWith('laser-')
            ? Object.fromEntries(
                  Object.entries(config).filter(
                      ([key]) => key !== 'sourceEntities',
                  ),
              )
            : config,
        options,
    );
    if (validateResult) validateToolpaths([result]);
    return result;
}

async function buildGcode(data: BuildGcodeRequest): Promise<unknown> {
    const { id, toolpaths, fileName, forcePolylineArcs } = data;
    postProgress(id, 5, 'Preparing G-code');
    return CamOps.buildGcodeAsync({
        toolpaths,
        fileName,
        forcePolylineArcs,
        onProgress: ((percent: number, label: string) =>
            postProgress(id, percent, label)) as unknown as () => void,
    });
}

self.onmessage = async (event: MessageEvent<CamWorkerRequest>) => {
    const data = event.data;
    if (data.type === 'cancel') {
        cancelledRequestIds.add(data.targetId);
        return;
    }
    try {
        if (data.type === 'process-laser-image') {
            const result = processLaserImage(
                data.bitmap,
                data.interval,
                data.gamma,
                data.options,
                (percent, label) => postProgress(data.id, percent, label),
            );
            self.postMessage(
                { id: data.id, result },
                { transfer: [result.data.buffer] },
            );
            return;
        }
        await ensureClipper();
        if (data.type === 'export-program')
            postProgress(data.id, 5, 'Preparing laser export');
        const result =
            data.type === 'export-program'
                ? exportToolpaths(
                      data.toolpaths,
                      data.fileName,
                      data.arcs,
                      data.units,
                      data.settings,
                  )
                : data.type === 'build-toolpath'
                  ? await buildToolpath(data)
                  : await buildGcode(data);
        if (!cancelledRequestIds.has(data.id)) {
            postProgress(
                data.id,
                100,
                data.type === 'build-toolpath'
                    ? 'Toolpath ready'
                    : 'G-code ready',
            );
            post({ id: data.id, result });
        }
    } catch (error) {
        if (!cancelledRequestIds.has(data.id)) {
            post({
                id: data.id,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? (error.stack ?? null) : null,
            });
        }
    } finally {
        cancelledRequestIds.delete(data.id);
    }
};
