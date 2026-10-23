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
    manualCuttingParams?: boolean;
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

export interface RotaryMeshSettings {
    strategy: 'around' | 'along' | 'helix' | 'indexed' | 'simultaneous';
    cellSize: number;
    tolerance: number;
    stepover: number;
    angleStep: number;
    fluteLength: number;
    shankDiameter: number;
    stickout: number;
    holderDiameter: number;
    tailClearance: number;
    clearance: number;
    rotaryRate: number;
    independentAxis: boolean;
}

export interface RotaryOps {
    mesh?: RotaryMeshSettings;
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

export type RotaryOperation = 'face' | 'rough' | 'finish' | 'groove' | 'part';
export interface RotaryToolpathEntry {
    id: string;
    operation: RotaryOperation;
    tool: RotaryTool;
    ops: Omit<RotaryOps, 'pommels' | 'compR'>;
}

export type RotaryMode = 'profile' | 'stl';

export interface ToolpathMove {
    y?: number;
    /** Inverse-time block duration in minutes for verified mesh paths. */
    minutes?: number;
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
 * (same rule as undo snapshots); a missing STL blocks output until reimport.
 */
export interface RotaryProjectSlice {
    operation?: RotaryOperation;
    toolpathEditorOpen?: boolean;
    editingToolpathId?: string | null;
    toolpaths?: RotaryToolpathEntry[];
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
    if (
        v.operation !== undefined &&
        !['face', 'rough', 'finish', 'groove', 'part'].includes(
            String(v.operation),
        )
    )
        return false;
    if (
        v.toolpathEditorOpen !== undefined &&
        typeof v.toolpathEditorOpen !== 'boolean'
    )
        return false;
    if (
        v.editingToolpathId !== undefined &&
        v.editingToolpathId !== null &&
        typeof v.editingToolpathId !== 'string'
    )
        return false;
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
    if (
        v.toolpaths !== undefined &&
        (!Array.isArray(v.toolpaths) ||
            !v.toolpaths.every(isRotaryToolpathEntry) ||
            new Set(v.toolpaths.map((entry) => entry.id)).size !==
                v.toolpaths.length)
    )
        return false;
    return true;
}
function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
export function isRotaryToolpathEntry(
    entry: unknown,
): entry is RotaryToolpathEntry {
    if (
        !isRecord(entry) ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        !['face', 'rough', 'finish', 'groove', 'part'].includes(
            String(entry.operation),
        )
    )
        return false;
    const tool = entry.tool,
        ops = entry.ops;
    if (
        !isRecord(tool) ||
        !isRecord(ops) ||
        !isRecord(ops.groove) ||
        !isRecord(ops.part)
    )
        return false;
    return (
        ['flat', 'ball', 'taper', 'vbit'].includes(String(tool.type)) &&
        finite(tool.spindle) &&
        tool.spindle >= 0 &&
        ['dia', 'feed', 'plunge'].every(
            (key) => finite(tool[key]) && Number(tool[key]) > 0,
        ) &&
        (tool.slotNum === null ||
            (finite(tool.slotNum) &&
                Number.isInteger(tool.slotNum) &&
                tool.slotNum > 0)) &&
        ['allow', 'roughStep', 'raster'].every((key) => finite(ops[key])) &&
        Number(ops.allow) >= 0 &&
        Number(ops.roughStep) > 0 &&
        [0, 270].includes(Number(ops.raster)) &&
        finite(ops.groove.x) &&
        finite(ops.groove.w) &&
        ops.groove.w > 0 &&
        finite(ops.part.x) &&
        (ops.mesh === undefined || isRotaryMeshSettings(ops.mesh))
    );
}

export function isRotaryMeshSettings(
    value: unknown,
): value is RotaryMeshSettings {
    if (!isRecord(value)) return false;
    return (
        ['around', 'along', 'helix', 'indexed', 'simultaneous'].includes(
            String(value.strategy),
        ) &&
        typeof value.independentAxis === 'boolean' &&
        [
            'cellSize',
            'tolerance',
            'stepover',
            'angleStep',
            'fluteLength',
            'shankDiameter',
            'stickout',
            'holderDiameter',
            'tailClearance',
            'clearance',
            'rotaryRate',
        ].every((k) => finite(value[k]) && Number(value[k]) >= 0)
    );
}
