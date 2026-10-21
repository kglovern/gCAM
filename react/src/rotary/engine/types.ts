/**
 * Purpose: Shared rotary (Vortex) CAM types for the gCAM rotary workflow.
 * The profile is radius-vs-X (X = along the rotary axis, chuck face at X=0);
 * G-code programs X/Z in mm with Z-zero at the cylinder axis and A in degrees.
 */

export type ProfilePointType = 'corner' | 'smooth' | 'sym';

export interface ProfileHandle {
    x: number;
    r: number;
}

export interface ProfilePoint {
    x: number;
    r: number;
    type: ProfilePointType;
    /** Toward the chuck (left). */
    h1: ProfileHandle;
    /** Toward the tailstock (right). */
    h2: ProfileHandle;
}

export interface ProfileSample {
    x: number;
    r: number;
}

export interface RotaryStock {
    /** Total bar length including the gripped part, mm. */
    length: number;
    diameter: number;
    /** Length held in the chuck jaws (no cutting here), mm. */
    grip: number;
    /** Extended track fitted (39.5" capacity instead of 21.5"). */
    ext: boolean;
}

export type RotaryToolType = 'flat' | 'ball' | 'taper' | 'vbit';

export interface RotaryTool {
    type: RotaryToolType;
    /** Cutter diameter, mm. */
    dia: number;
    spindle: number;
    /** Cutting feed, mm/min. */
    feed: number;
    /** Plunge feed, mm/min. */
    plunge: number;
    /** gCAM tool-library slot, if picked from the rack. */
    slotNum: number | null;
}

export interface PommelZone {
    x0: number;
    x1: number;
    /** Flat-to-flat width of the square, mm. */
    w: number;
}

export interface GrooveOp {
    on: boolean;
    x: number;
    w: number;
}

export interface PartOp {
    on: boolean;
    x: number;
}

export interface RotaryOps {
    face: boolean;
    rough: boolean;
    /** Allowance left for the finish pass, mm. */
    allow: number;
    roughStep: number;
    finish: boolean;
    /** 270 = helical along A (default), 0 = indexed angles. */
    raster: number;
    groove: GrooveOp;
    part: PartOp;
    pommels: PommelZone[];
    /** Ballnose tooltip compensation radius (STL mode, round tools). */
    compR: number;
}

export type RotaryMode = 'profile' | 'stl';

export interface ToolpathMove {
    x?: number;
    z?: number;
    a?: number;
    f?: number;
    op: string;
    rapid?: boolean;
}

export type CheckLevel = 'e' | 'w' | 'o';

export interface RotaryCheck {
    level: CheckLevel;
    msg: string;
}

export interface StlMesh {
    name: string;
    key: string;
    /** Baked viewer coords: X along rotary, Y/Z radial, axis at origin. */
    positions: Float32Array;
    triangles: number;
}

/**
 * Rotary slice of a gCAM project file (.gcam.json). The mesh itself is
 * never serialized — stlKey re-links a mesh already loaded in the session
 * (same rule as undo snapshots); otherwise STL mode falls back to profile.
 */
export interface RotaryProjectSlice {
    name: string;
    mode: RotaryMode;
    stlKey?: string;
    pommels: PommelZone[];
    points: ProfilePoint[];
    stock: RotaryStock;
    tool: RotaryTool;
    ops: Omit<RotaryOps, 'compR' | 'pommels'>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

export function isRotaryProjectSlice(v: unknown): v is RotaryProjectSlice {
    if (!isRecord(v)) {
        return false;
    }
    if (typeof v['name'] !== 'string') {
        return false;
    }
    if (v['mode'] !== 'profile' && v['mode'] !== 'stl') {
        return false;
    }
    if (!Array.isArray(v['points']) || !Array.isArray(v['pommels'])) {
        return false;
    }
    if (!isRecord(v['stock']) || !isRecord(v['tool']) || !isRecord(v['ops'])) {
        return false;
    }
    if (v['stlKey'] !== undefined && typeof v['stlKey'] !== 'string') {
        return false;
    }
    return true;
}
