import { validateImageMaskSources } from '../cam/raster-region.js';
/**
 * Purpose: Implementation module for project in the lib domain.
 */
import { normalizeLayers, type DrawingLayer } from '../layers/model';
import { normalizeJobStock, type JobStock } from '../job/stock';
import type { StoredSurfaceMesh } from '../engine/surface-model';
import { validateOutput, type OutputSettings } from '../gcode/profiles';
import type { UnitSystem } from './units';
import { validateToolpaths } from '../cam/gcode-validation.js';

export interface ProjectSnapshot {
    outputSettings?: OutputSettings;
    outputUnits?: UnitSystem;
    loops: {
        id?: string;
        points: { x: number; y: number }[];
        groupId?: string;
        layerId?: string;
    }[];
    selected: string[];
    hidden: string[];
    stack: StackEntryLike[];
    bitmaps: BitmapLike[];
    guides: GuideLike[];
    fileName: string;
    stock?: JobStock;
    /**
     * Opaque rotary-workflow slice (owned + validated by src/rotary).
     * Absent in older files; never required.
     */
    rotary?: unknown;
    layers?: DrawingLayer[];
    activeLayerId?: string;
}

export interface StackEntryLike {
    id: string;
    label: string;
    customLabel?: string;
    outputEnabled?: boolean;
    args: unknown;
    preview: {
        points: { x: number; y: number }[];
        variableLaserPower?: boolean;
    }[];
    toolpath: Record<string, unknown>;
}

export interface BitmapLike {
    maskSourceIds?: string[];
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    dataUrl: string;
    /** Browser-local cache key. Exports retain dataUrl for portability. */
    assetId?: string;
    surfaceMesh?: StoredSurfaceMesh;
}

export interface GuideLike {
    id: string;
    point: { x: number; y: number };
    direction: { x: number; y: number };
}

export interface ProjectEnvelopeV1 {
    kind: string;
    version: 1;
    exportedAt: string;
    fileName: string;
    snapshot: ProjectSnapshot;
}

export interface ProjectEnvelopeV2 {
    kind: 'gcam.project';
    version: 2;
    exportedAt: string;
    fileName: string;
    snapshot: ProjectSnapshot;
}

export interface ProjectEnvelopeV3 {
    kind: 'gcam.project';
    version: 3;
    exportedAt: string;
    fileName: string;
    bitmapSources: string[];
    snapshot: Omit<ProjectSnapshot, 'bitmaps'> & {
        bitmaps: (Omit<BitmapLike, 'dataUrl'> & { sourceIndex: number })[];
    };
}

export type ProjectEnvelopeV4 = Omit<ProjectEnvelopeV3, 'version'> & {
    version: 4;
};

/** V4 layout whose stack may hold entries saved without computed toolpath data. */
export type ProjectEnvelopeV5 = Omit<ProjectEnvelopeV3, 'version'> & {
    version: 5;
};

export type ProjectEnvelope =
    | ProjectEnvelopeV1
    | ProjectEnvelopeV2
    | ProjectEnvelopeV3
    | ProjectEnvelopeV4
    | ProjectEnvelopeV5;

export const PROJECT_KINDS = ['gcam.project', 'camcanvas.project'];

function compactLaserPreview(entry: StackEntryLike): StackEntryLike {
    if (
        entry.toolpath?.operation !== 'laser-raster' ||
        !Array.isArray(entry.toolpath.laserPaths)
    )
        return entry;
    return {
        ...entry,
        preview: [],
        toolpath: {
            ...entry.toolpath,
            previewContours: [],
            previewFromLaserPaths: true,
        },
    };
}

function restoreLaserPreview(entry: StackEntryLike): StackEntryLike {
    const path = entry?.toolpath;
    if (
        path?.operation !== 'laser-raster' ||
        path.previewFromLaserPaths !== true
    )
        return entry;
    if (!Array.isArray(path.laserPaths))
        throw new Error('Invalid saved laser preview.');
    let count = 0;
    for (const row of path.laserPaths) {
        if (!Array.isArray(row?.points))
            throw new Error('Invalid saved laser preview.');
        count += row.points.length;
        if (count > 2000000)
            throw new Error('Saved laser preview is too large.');
    }
    validateToolpaths([path]);
    if (
        count * Number((path.laserOptions as { passes: number }).passes) >
        2000000
    )
        throw new Error('Saved laser preview is too large.');
    const contours = path.laserPaths.map(({ points }) =>
        Object.assign([...points], { _laserVariablePower: true }),
    );
    return {
        ...entry,
        toolpath: { ...path, previewContours: contours },
        preview: contours.map((points) => ({
            points,
            variableLaserPower: true,
        })),
    };
}

/**
 * Bitmap and GPU surface operations need decoded pixels or WebGPU to rebuild,
 * so they keep their computed data; every other operation rebuilds from args.
 */
const KEEP_COMPUTED = new Set(['laser-raster', 'wavy-raster', 'halftone']);

export function canRegenerateToolpath(entry: StackEntryLike): boolean {
    const operation = (entry.args as { operation?: unknown } | undefined)
        ?.operation;
    return (
        typeof operation === 'string' &&
        !KEEP_COMPUTED.has(operation) &&
        !operation.startsWith('surface-') &&
        entry.toolpath?.operation === operation &&
        Array.isArray((entry.args as { loops?: unknown }).loops)
    );
}

/** Saved in place of omitted geometry; see serializeProject `compact`. */
export interface PendingRegeneration {
    /** toolpathDigest of the geometry when saved. */
    digest: string;
    /** Original toolpath key order, so a rebuild restores the same shape. */
    keys: string[];
    /** Built by the CAM worker rather than the main-thread engine. */
    worker: boolean;
}

export function pendingRegeneration(
    entry: StackEntryLike,
): PendingRegeneration | null {
    const pending = entry.toolpath?.pendingRegeneration;
    return pending && typeof pending === 'object'
        ? (pending as PendingRegeneration)
        : null;
}

export function isPendingRegeneration(entry: StackEntryLike): boolean {
    return pendingRegeneration(entry) !== null;
}

/**
 * Order-sensitive fingerprint of the geometry the G-code emitter consumes,
 * rounded to 1 µm so it survives float noise between machines.
 */
export function toolpathDigest(toolpath: Record<string, unknown>): string {
    let hash = 0x811c9dc5;
    let count = 0;
    const mix = (value: number) => {
        hash = Math.imul(hash ^ (value | 0), 0x01000193) >>> 0;
    };
    for (const key of [
        'motionPaths',
        'previewContours',
        'trochoidPreviewContours',
    ]) {
        const paths = toolpath[key];
        mix(Array.isArray(paths) ? paths.length : -1);
        if (!Array.isArray(paths)) continue;
        for (const path of paths) {
            const points = Array.isArray(path)
                ? path
                : (path as { points?: unknown })?.points;
            if (!Array.isArray(points)) continue;
            mix(points.length);
            for (const point of points as {
                x: number;
                y: number;
                z?: number;
            }[]) {
                mix(Math.round(point.x * 1000));
                mix(Math.round(point.y * 1000));
                if (typeof point.z === 'number')
                    mix(Math.round(point.z * 1000));
                count += 1;
            }
        }
    }
    return `${hash.toString(16).padStart(8, '0')}:${count}`;
}

/**
 * Arrays hold the computed geometry and are omitted; scalar settings stay so a
 * rebuild only has to supply geometry.
 */
function omitToolpathData(entry: StackEntryLike): StackEntryLike {
    if (isPendingRegeneration(entry) || !canRegenerateToolpath(entry))
        return entry;
    const settings = Object.fromEntries(
        Object.entries(entry.toolpath).filter(
            ([, value]) => !Array.isArray(value),
        ),
    );
    const pending: PendingRegeneration = {
        digest: toolpathDigest(entry.toolpath),
        keys: Object.keys(entry.toolpath),
        // Only the worker client tags source loops with isBitmap.
        worker:
            Array.isArray(entry.toolpath.sourceLoops) &&
            entry.toolpath.sourceLoops.some(
                (loop) =>
                    loop && typeof loop === 'object' && 'isBitmap' in loop,
            ),
    };
    return {
        ...entry,
        preview: [],
        toolpath: { ...settings, pendingRegeneration: pending },
    };
}

function validatePendingEntry(entry: StackEntryLike): StackEntryLike {
    if (entry.toolpath?.pendingRegeneration === undefined) return entry;
    const pending = pendingRegeneration(entry);
    if (
        !pending ||
        !canRegenerateToolpath(entry) ||
        typeof pending.digest !== 'string' ||
        typeof pending.worker !== 'boolean' ||
        !Array.isArray(pending.keys) ||
        !pending.keys.every((key) => typeof key === 'string')
    )
        throw new Error('Invalid saved toolpath.');
    return { ...entry, preview: [] };
}

export interface SerializeOptions {
    /**
     * Drop toolpath geometry that rebuilds from each entry's args and write
     * minified JSON. Readers must call regenerateStack before export.
     */
    compact?: boolean;
}

export function serializeProject(
    snapshot: ProjectSnapshot,
    options: SerializeOptions = {},
): string {
    const compacted = options.compact
        ? snapshot.stack.map(omitToolpathData)
        : snapshot.stack;
    const pending = compacted.some(isPendingRegeneration);
    const sources = [...new Set(snapshot.bitmaps.map((b) => b.dataUrl))];
    const shared = sources.length < snapshot.bitmaps.length;
    const linked =
        snapshot.bitmaps.some((b) => b.maskSourceIds?.length) ||
        snapshot.stack.some(
            (e) =>
                (e.args as { laserOptions?: { maskSourceIds?: string[] } })
                    ?.laserOptions?.maskSourceIds?.length,
        );
    const indices = new Map(sources.map((source, index) => [source, index]));
    const base: ProjectEnvelopeV2 = {
        kind: 'gcam.project',
        version: 2,
        exportedAt: new Date().toISOString(),
        fileName: snapshot.fileName || '',
        snapshot: {
            ...snapshot,
            stack: compacted.map(compactLaserPreview),
        },
    };
    // Older readers must reject source sharing, live mask links or omitted toolpaths they cannot preserve.
    const envelope: ProjectEnvelope =
        shared || linked || pending
            ? {
                  ...base,
                  version: pending ? 5 : linked ? 4 : 3,
                  bitmapSources: sources,
                  snapshot: {
                      ...base.snapshot,
                      bitmaps: snapshot.bitmaps.map(
                          ({ dataUrl, ...bitmap }) => ({
                              ...bitmap,
                              sourceIndex: indices.get(dataUrl)!,
                          }),
                      ),
                  },
              }
            : base;
    try {
        return options.compact
            ? JSON.stringify(envelope)
            : JSON.stringify(envelope, null, 2);
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        const [path, size] = largestJsonPath(envelope);
        throw new Error(
            `Project is too large to save: ${path} is about ${Math.round(size / 1e6)} MB.`,
        );
    }
}

const JSON_SIZE_CAP = 2 ** 30;

/** Approximate JSON length, counting shared references once per use as JSON.stringify does. */
function jsonSize(value: unknown, budget = JSON_SIZE_CAP): number {
    if (value === null || typeof value !== 'object')
        return typeof value === 'string'
            ? value.length + 2
            : String(value).length;
    if (ArrayBuffer.isView(value))
        // Typed arrays serialize as {"0":v,...}.
        return (value as unknown as ArrayLike<unknown>).length * 10;
    let size = 2;
    for (const [key, child] of Object.entries(value)) {
        size += key.length + 4 + jsonSize(child, budget - size);
        if (size > budget) return size;
    }
    return size;
}

/** Descend into the largest child until no single child dominates. */
function largestJsonPath(root: unknown): [string, number] {
    let path = 'project';
    let value = root;
    let size = jsonSize(root);
    for (let depth = 0; depth < 8; depth++) {
        if (value === null || typeof value !== 'object') break;
        let best: [string, unknown, number] | null = null;
        for (const [key, child] of Object.entries(value)) {
            const childSize = jsonSize(child);
            if (!best || childSize > best[2]) best = [key, child, childSize];
        }
        if (!best || best[2] < size / 2) break;
        [path, value, size] = [`${path}.${best[0]}`, best[1], best[2]];
    }
    return [path, size];
}

export function deserializeProject(raw: string): ProjectSnapshot {
    let doc: Partial<ProjectEnvelope>;
    try {
        doc = JSON.parse(raw);
    } catch {
        throw new Error('This is not a valid gCAM project file.');
    }
    const snap = doc?.snapshot;
    if (
        !doc ||
        !PROJECT_KINDS.includes(doc.kind ?? '') ||
        (doc.version !== 1 &&
            doc.version !== 2 &&
            doc.version !== 3 &&
            doc.version !== 4 &&
            doc.version !== 5) ||
        !snap ||
        !Array.isArray(snap.loops) ||
        !Array.isArray(snap.stack)
    ) {
        throw new Error('This is not a valid gCAM project file.');
    }
    let bitmaps: BitmapLike[];
    if (doc.version === 3 || doc.version === 4 || doc.version === 5) {
        const sources = doc.bitmapSources;
        if (
            !Array.isArray(sources) ||
            !sources.every((source) => typeof source === 'string') ||
            !Array.isArray(snap.bitmaps)
        )
            throw new Error('Invalid saved bitmap sources.');
        bitmaps = snap.bitmaps.map((bitmap) => {
            const index = (bitmap as { sourceIndex?: unknown })?.sourceIndex;
            if (
                typeof index !== 'number' ||
                !Number.isSafeInteger(index) ||
                index < 0 ||
                index >= sources.length ||
                'dataUrl' in bitmap
            )
                throw new Error('Invalid saved bitmap source reference.');
            const { sourceIndex: _, ...placement } = bitmap as Omit<
                BitmapLike,
                'dataUrl'
            > & { sourceIndex: number };
            return { ...placement, dataUrl: sources[index] };
        });
    } else {
        bitmaps = Array.isArray(snap.bitmaps)
            ? (snap.bitmaps as BitmapLike[])
            : [];
    }
    for (const bitmap of bitmaps)
        validateImageMaskSources(bitmap.maskSourceIds);
    for (const entry of snap.stack)
        validateImageMaskSources(
            (
                entry.args as
                    | { laserOptions?: { maskSourceIds?: string[] } }
                    | undefined
            )?.laserOptions?.maskSourceIds,
        );
    return {
        outputUnits:
            snap.outputUnits === 'metric' || snap.outputUnits === 'imperial'
                ? snap.outputUnits
                : undefined,
        outputSettings: snap.outputSettings
            ? validateOutput(snap.outputSettings)
            : undefined,
        layers: normalizeLayers(snap.layers, snap.loops),
        activeLayerId: snap.activeLayerId,
        loops: snap.loops,
        selected: Array.isArray(snap.selected) ? snap.selected : [],
        stack: snap.stack.map((entry) =>
            restoreLaserPreview(validatePendingEntry(entry)),
        ),
        hidden: Array.isArray((snap as { hidden?: unknown }).hidden)
            ? (snap as unknown as { hidden: string[] }).hidden
            : [],
        bitmaps,
        guides: Array.isArray((snap as { guides?: unknown }).guides)
            ? (snap as { guides: GuideLike[] }).guides
            : [],
        fileName: doc.fileName || snap.fileName || '',
        stock: normalizeJobStock((snap as { stock?: unknown }).stock),
        rotary: (snap as { rotary?: unknown }).rotary,
    };
}
