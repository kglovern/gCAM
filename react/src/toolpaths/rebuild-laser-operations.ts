import { buildToolpathGcodeAsync, type RasterBitmap } from '../lib/engine';
import { laserOptions } from '../cam/laser.js';
import { copyLaserSettings } from './copy-laser-settings';
import { previewFor, type ToolpathStackEntry } from './useToolpathStack';

export interface LaserBulkPatch {
    feed?: number;
    power?: number;
    passes?: number;
}

/** Stage every result before the caller commits; failures never publish partial geometry. */
export async function rebuildLaserOperations(
    entries: ToolpathStackEntry[],
    patch: LaserBulkPatch,
    options: {
        signal: AbortSignal;
        resolveBitmap: (entry: ToolpathStackEntry) => RasterBitmap;
        maxFeed?: number;
        onProgress?: (percent: number, label: string) => void;
        build?: typeof buildToolpathGcodeAsync;
    },
): Promise<ToolpathStackEntry[]> {
    if (
        patch.feed !== undefined &&
        (!Number.isFinite(patch.feed) || patch.feed <= 0)
    )
        throw new Error('Speed must be positive.');
    if (
        patch.power !== undefined &&
        (!Number.isFinite(patch.power) || patch.power < 0 || patch.power > 1000)
    )
        throw new Error('Power must be between 0 and 100%.');
    if (
        patch.passes !== undefined &&
        (!Number.isInteger(patch.passes) ||
            patch.passes < 1 ||
            patch.passes > 100)
    )
        throw new Error('Passes must be a whole number from 1 to 100.');
    const jobs = entries.flatMap((entry) => {
        const old = copyLaserSettings(entry.args, entry.args.operation);
        const passes = laserOptions(entry.args.laserOptions).passes;
        if (
            (patch.feed === undefined || patch.feed === old.feed) &&
            (patch.power === undefined || patch.power === old.power) &&
            (patch.passes === undefined || patch.passes === passes)
        )
            return [];
        const args = {
            ...entry.args,
            ...(patch.feed === undefined ? {} : { laserFeed: patch.feed }),
            ...(patch.power === undefined
                ? {}
                : {
                      laserPower: patch.power,
                      ...(entry.args.operation === 'laser-raster'
                          ? { laserSMax: patch.power }
                          : {}),
                  }),
            ...(patch.passes === undefined
                ? {}
                : {
                      laserOptions: {
                          ...entry.args.laserOptions,
                          passes: patch.passes,
                      },
                  }),
        };
        if (
            entry.args.operation === 'laser-raster' &&
            patch.power !== undefined &&
            patch.power < (entry.args.laserSMin ?? 0)
        )
            throw new Error(
                `${entry.label}: maximum power is below its minimum power.`,
            );
        copyLaserSettings(args, args.operation, options.maxFeed);
        return [{ entry, args }];
    });
    const results: ToolpathStackEntry[] = [];
    for (let i = 0; i < jobs.length; i++) {
        if (options.signal.aborted)
            throw new DOMException('Bulk changes cancelled.', 'AbortError');
        const { entry, args } = jobs[i];
        const result = await (options.build ?? buildToolpathGcodeAsync)({
            ...args,
            geometryOnly: true,
            ...(args.operation === 'laser-raster'
                ? { bitmap: options.resolveBitmap(entry) }
                : {}),
            signal: options.signal,
            onProgress: (percent) =>
                options.onProgress?.(
                    ((i +
                        Math.min(
                            100,
                            Math.max(0, Number.isFinite(percent) ? percent : 0),
                        ) /
                            100) /
                        jobs.length) *
                        100,
                    `Rebuilding ${i + 1}/${jobs.length} · ${entry.label}`,
                ),
        });
        if (options.signal.aborted)
            throw new DOMException('Bulk changes cancelled.', 'AbortError');
        results.push({
            ...entry,
            args,
            preview: previewFor(result),
            toolpath: {
                ...result.toolpath,
                id: entry.toolpath.id ?? entry.id,
                label: entry.label,
            },
        });
    }
    return results;
}

export function mergeRebuiltLaserOperations(
    current: ToolpathStackEntry[],
    before: ToolpathStackEntry[],
    replacements: ToolpathStackEntry[],
) {
    if (
        before.some(
            (entry) =>
                current.find((candidate) => candidate.id === entry.id) !==
                entry,
        )
    )
        return current;
    const byId = new Map(replacements.map((entry) => [entry.id, entry]));
    return current.map((entry) => byId.get(entry.id) ?? entry);
}
