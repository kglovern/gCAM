/**
 * Purpose: Implementation module for project in the lib domain.
 */
import { normalizeJobStock, type JobStock } from '../job/stock';
import type { StoredSurfaceMesh } from '../engine/surface-model';

export interface ProjectSnapshot {
    loops: {
        id?: string;
        points: { x: number; y: number }[];
        groupId?: string;
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
}

export interface StackEntryLike {
    id: string;
    label: string;
    args: unknown;
    preview: { points: { x: number; y: number }[] }[];
    toolpath: Record<string, unknown>;
}

export interface BitmapLike {
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

export type ProjectEnvelope = ProjectEnvelopeV1 | ProjectEnvelopeV2;

export const PROJECT_KINDS = ['gcam.project', 'camcanvas.project'];

export function serializeProject(snapshot: ProjectSnapshot): string {
    const envelope: ProjectEnvelopeV2 = {
        kind: 'gcam.project',
        version: 2,
        exportedAt: new Date().toISOString(),
        fileName: snapshot.fileName || '',
        snapshot,
    };
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
        (doc.version !== 1 && doc.version !== 2) ||
        !snap ||
        !Array.isArray(snap.loops) ||
        !Array.isArray(snap.stack)
    ) {
        throw new Error('This is not a valid gCAM project file.');
    }
    return {
        loops: snap.loops,
        selected: Array.isArray(snap.selected) ? snap.selected : [],
        stack: snap.stack,
        hidden: Array.isArray((snap as { hidden?: unknown }).hidden)
            ? (snap as unknown as { hidden: string[] }).hidden
            : [],
        bitmaps: Array.isArray((snap as { bitmaps?: unknown }).bitmaps)
            ? (snap as { bitmaps: BitmapLike[] }).bitmaps
            : [],
        guides: Array.isArray((snap as { guides?: unknown }).guides)
            ? (snap as { guides: GuideLike[] }).guides
            : [],
        fileName: doc.fileName || snap.fileName || '',
        stock: normalizeJobStock((snap as { stock?: unknown }).stock),
        rotary: (snap as { rotary?: unknown }).rotary,
    };
}
