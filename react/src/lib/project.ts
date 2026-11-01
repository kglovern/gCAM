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

export type ProjectEnvelope =
    | ProjectEnvelopeV1
    | ProjectEnvelopeV2
    | ProjectEnvelopeV3
    | ProjectEnvelopeV4;

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

export function serializeProject(snapshot: ProjectSnapshot): string {
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
            stack: snapshot.stack.map(compactLaserPreview),
        },
    };
    // Older readers must reject source sharing or live mask links they cannot preserve.
    const envelope: ProjectEnvelope =
        shared || linked
            ? {
                  ...base,
                  version: linked ? 4 : 3,
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
    return JSON.stringify(envelope, null, 2);
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
            doc.version !== 4) ||
        !snap ||
        !Array.isArray(snap.loops) ||
        !Array.isArray(snap.stack)
    ) {
        throw new Error('This is not a valid gCAM project file.');
    }
    let bitmaps: BitmapLike[];
    if (doc.version === 3 || doc.version === 4) {
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
        stack: snap.stack.map(restoreLaserPreview),
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
