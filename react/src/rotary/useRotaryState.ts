import { toGcode } from './engine/gcode';
/**
 * Purpose: Rotary workflow state — conversational profile xor STL mesh,
 * stock/tool/ops, undo snapshots, and memoized toolpath derivation.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    createHistory,
    pushHistory as pushHist,
    redoHistory,
    undoHistory,
    type History,
} from '../lib/history';
import {
    cloneToolpath,
    legacyToolpaths,
    operationLabel,
    planRotaryEntry,
    planRotaryJob,
    rotaryJobGcode,
} from './engine/job';
import {
    CHUCK_CLEARANCE,
    clonePoints,
    defaultProfile,
    fitHandles,
    insertNode,
    sampleProfile,
    templateProfile,
} from './engine/profileModel';
import type {
    PommelZone,
    ProfilePoint,
    ProfileSample,
    RotaryCheck,
    RotaryMode,
    RotaryOps,
    RotaryProjectSlice,
    RotaryStock,
    RotaryTool,
    RotaryOperation,
    RotaryToolpathEntry,
    StlMesh,
    ToolpathMove,
} from './engine/types';
import { isRotaryProjectSlice } from './engine/types';
import { estimate } from './engine/toolpath';
import type { ToolpathEstimate } from './engine/toolpath';
import {
    bakeForViewer,
    meshBounds,
    parseSTL,
    silhouette,
    fitPoints,
} from './engine/stl';

export interface StlInfo {
    tris: number;
    sx: string;
    sy: string;
    sz: string;
    len: string;
    maxDia: string;
}

interface Snapshot {
    editingToolpathId: string | null;
    toolpathEditorOpen: boolean;
    toolpaths: RotaryToolpathEntry[];
    operation: RotaryOperation;
    points: ProfilePoint[];
    stock: RotaryStock;
    tool: RotaryTool;
    opsBase: Omit<RotaryOps, 'compR' | 'pommels'>;
    mode: RotaryMode;
    name: string;
    stlKey: string | undefined;
    pommels: PommelZone[];
}

export type OpsBase = Snapshot['opsBase'];

const DEFAULT_OPS: OpsBase = {
    face: true,
    rough: true,
    allow: 0.8,
    roughStep: 2,
    finish: true,
    raster: 270,
    groove: { on: false, x: 55, w: 3 },
    part: { on: false, x: 80 },
};

export function compRFor(mode: RotaryMode, tool: RotaryTool): number {
    if (mode !== 'stl') {
        return 0;
    }
    return tool.type === 'flat' ? 0 : tool.dia / 2;
}

export function useRotaryState(): RotaryStateApi {
    const [toolpaths, setToolpaths] = useState<RotaryToolpathEntry[]>([]);
    const [operation, setOperation] = useState<RotaryOperation>('rough');
    const [editingToolpathId, setEditingToolpathId] = useState<string | null>(
        null,
    );
    const [toolpathEditorOpen, setToolpathEditorOpen] = useState(true);
    const [name, setName] = useState('queen-test');
    const [mode, setModeState] = useState<RotaryMode>('profile');
    const [points, setPoints] = useState<ProfilePoint[]>(defaultProfile);
    const [sel, setSel] = useState(-1);
    const [pommels, setPommels] = useState<PommelZone[]>([]);
    const [stock, setStock] = useState<RotaryStock>({
        length: 90,
        diameter: 25.4,
        grip: 19,
        ext: false,
    });
    const [tool, setTool] = useState<RotaryTool>({
        type: 'ball',
        dia: 6.35,
        spindle: 16000,
        feed: 1270,
        plunge: 381,
        slotNum: null,
        manualCuttingParams: false,
    });
    const [opsBase, setOpsBase] = useState<OpsBase>(DEFAULT_OPS);
    const [stlMesh, setStlMesh] = useState<StlMesh | null>(null);
    const [stlInfo, setStlInfo] = useState<StlInfo | null>(null);
    const [showStock, setShowStock] = useState(true);
    const [showPath, setShowPath] = useState(true);
    const [gcode, setGcode] = useState('');
    // Shared gCAM snapshot-stack utility (same semantics as the 2.5D
    // document history). Mesh excluded — only its key travels.
    const hist = useRef<History<Snapshot>>(createHistory<Snapshot>(80));

    const snap = useCallback((): Snapshot => {
        return {
            toolpaths: toolpaths.map(cloneToolpath),
            editingToolpathId,
            toolpathEditorOpen,
            operation,
            points: clonePoints(points),
            stock: { ...stock },
            tool: { ...tool },
            opsBase: {
                ...opsBase,
                groove: { ...opsBase.groove },
                part: { ...opsBase.part },
            },
            mode,
            name,
            stlKey: stlMesh?.key,
            pommels: pommels.map((p) => ({ ...p })),
        };
    }, [
        points,
        stock,
        tool,
        opsBase,
        mode,
        name,
        stlMesh,
        pommels,
        toolpaths,
        operation,
        editingToolpathId,
        toolpathEditorOpen,
    ]);

    const pushHistory = useCallback(() => {
        pushHist(hist.current, snap());
    }, [snap]);

    const restore = useCallback(
        (s: Snapshot) => {
            setToolpaths(s.toolpaths.map(cloneToolpath));
            setOperation(s.operation);
            setEditingToolpathId(s.editingToolpathId);
            setToolpathEditorOpen(s.toolpathEditorOpen);
            setPoints(s.points);
            setStock(s.stock);
            setTool(s.tool);
            setOpsBase(s.opsBase);
            setModeState(
                s.mode === 'stl' && stlMesh?.key === s.stlKey
                    ? 'stl'
                    : 'profile',
            );
            setName(s.name);
            setPommels(s.pommels);
            setSel(-1);
        },
        [stlMesh],
    );

    const undo = useCallback(() => {
        const s = undoHistory(hist.current, snap());
        if (!s) {
            return;
        }
        restore(s);
    }, [restore, snap]);

    const redo = useCallback(() => {
        const s = redoHistory(hist.current, snap());
        if (!s) {
            return;
        }
        restore(s);
    }, [restore, snap]);

    const setMode = useCallback((m: RotaryMode) => {
        setModeState(m);
    }, []);

    /** Structural edit: snapshot first, drop to profile mode. */
    const commitPoints = useCallback(
        (next: ProfilePoint[]) => {
            pushHistory();
            setPoints(next);
            setModeState('profile');
        },
        [pushHistory],
    );

    const commitMapped = useCallback(
        (fn: (prev: ProfilePoint[]) => ProfilePoint[]) => {
            pushHistory();
            setPoints((prev) => {
                const next = fn(clonePoints(prev));
                next.sort((a, b) => a.x - b.x);
                fitHandles(next);
                return next;
            });
            setModeState('profile');
        },
        [pushHistory],
    );

    const deletePoint = useCallback(
        (i: number) => {
            pushHistory();
            setPoints((prev) => prev.filter((_, k) => k !== i));
            setSel(-1);
            setModeState('profile');
        },
        [pushHistory],
    );

    const setPointType = useCallback(
        (t: ProfilePoint['type']) => {
            commitMapped((next) => {
                const p = next[sel];
                if (!p) {
                    return next;
                }
                if (p.type === t) {
                    p.h1 = { x: p.x - 8, r: p.r };
                    p.h2 = { x: p.x + 8, r: p.r };
                } else {
                    p.type = t;
                    if (t === 'corner') {
                        p.h1 = { x: p.x, r: p.r };
                        p.h2 = { x: p.x, r: p.r };
                    }
                }
                return next;
            });
        },
        [commitMapped, sel],
    );

    const nudgePoint = useCallback(
        (dx: number, dr: number) => {
            commitMapped((next) => {
                const p = next[sel];
                if (!p) {
                    return next;
                }
                const loX = sel > 0 ? next[sel - 1].x : 0;
                p.x = Math.min(
                    sel < next.length - 1 ? next[sel + 1].x : Infinity,
                    Math.max(loX, p.x + dx),
                );
                p.r = Math.max(0, p.r + dr);
                return next;
            });
        },
        [commitMapped, sel],
    );

    const setPointValues = useCallback(
        (which: 'x' | 'r' | 'd', value: number) => {
            if (!Number.isFinite(value)) {
                return;
            }
            pushHistory();
            setPoints((prev) => {
                const next = clonePoints(prev);
                const p = next[sel];
                if (!p) {
                    return next;
                }
                const loX = sel > 0 ? next[sel - 1].x : 0;
                const hiX =
                    sel < next.length - 1 ? next[sel + 1].x : stock.length;
                const maxR = stock.diameter / 2 + 2;
                if (which === 'd') {
                    p.r = Math.min(maxR, Math.max(0, value / 2));
                } else if (which === 'r') {
                    p.r = Math.min(maxR, Math.max(0, value));
                } else {
                    p.x = Math.min(hiX, Math.max(loX, value));
                }
                fitHandles(
                    next,
                    [sel - 1, sel, sel + 1].filter(
                        (k) => k >= 0 && k < next.length,
                    ),
                );
                return next;
            });
            setModeState('profile');
        },
        [pushHistory, sel, stock],
    );

    const livePoints = useCallback((next: ProfilePoint[]) => {
        setPoints(next);
    }, []);

    const samples = useMemo(() => sampleProfile(points, 16), [points]);
    const compR = compRFor(mode, tool);
    const draft = useMemo(
        () =>
            planRotaryEntry(
                { id: 'draft', operation, tool, ops: opsBase },
                samples,
                stock,
                mode,
                pommels,
            ),
        [operation, tool, opsBase, samples, stock, mode, pommels],
    );
    const job = useMemo(
        () => planRotaryJob(toolpaths, samples, stock, mode, pommels),
        [toolpaths, samples, stock, mode, pommels],
    );
    const { moves, flags } = job;
    const programs = useMemo(
        () =>
            job.paths.map((path) => ({
                id: path.entry.id,
                label: operationLabel(path.entry.operation),
                gcode: toGcode(path.moves, {
                    stock,
                    mode,
                    name,
                    tool: path.entry.tool,
                    compR: path.compR,
                    toolChange: true,
                }),
            })),
        [job, stock, mode, name],
    );
    const stats = useMemo(() => estimate(moves), [moves]);
    const generate = useCallback(() => {
        setGcode(rotaryJobGcode(job, stock, mode, name));
    }, [job, stock, mode, name]);
    const saveToolpath = () => {
        if (
            draft.flags.some((flag) => flag.level === 'e') ||
            !draft.moves.length ||
            (mode === 'stl' && !stlMesh)
        )
            return;
        pushHistory();
        const entry = cloneToolpath({
            id: editingToolpathId ?? crypto.randomUUID(),
            operation,
            tool,
            ops: opsBase,
        });
        setToolpaths((list) =>
            editingToolpathId
                ? list.map((item) =>
                      item.id === editingToolpathId ? entry : item,
                  )
                : [...list, entry],
        );
        setEditingToolpathId(null);
        setToolpathEditorOpen(false);
    };
    const startToolpath = () => {
        setEditingToolpathId(null);
        setToolpathEditorOpen(true);
    };
    const cancelToolpathEdit = () => {
        setEditingToolpathId(null);
        setToolpathEditorOpen(false);
    };
    const editToolpath = (id: string) => {
        const entry = toolpaths.find((item) => item.id === id);
        if (!entry) return;
        setEditingToolpathId(id);
        setOperation(entry.operation);
        setTool({ ...entry.tool, manualCuttingParams: true });
        setOpsBase(cloneToolpath(entry).ops);
        setToolpathEditorOpen(true);
    };
    const removeToolpath = (id: string) => {
        pushHistory();
        setToolpaths((list) => list.filter((item) => item.id !== id));
        if (editingToolpathId === id) {
            setEditingToolpathId(null);
            setToolpathEditorOpen(false);
        }
    };
    const moveToolpath = (id: string, direction: -1 | 1) => {
        const index = toolpaths.findIndex((item) => item.id === id);
        if (
            index < 0 ||
            index + direction < 0 ||
            index + direction >= toolpaths.length
        )
            return;
        pushHistory();
        setToolpaths((list) => {
            const next = [...list];
            [next[index], next[index + direction]] = [
                next[index + direction],
                next[index],
            ];
            return next;
        });
    };

    const loadTemplate = useCallback(
        (templateName: string) => {
            pushHistory();
            setPoints(templateProfile(templateName));
            setModeState('profile');
        },
        [pushHistory],
    );

    const importStlFile = useCallback(
        async (file: File) => {
            pushHistory();
            const buf = await file.arrayBuffer();
            const verts = parseSTL(buf);
            const sil = silhouette(verts, 140, 3);
            const shift = stock.grip + 1;
            const fitted = fitPoints(sil, 30).map((p) => ({
                ...p,
                x: p.x + shift,
                h1: { x: p.h1.x + shift, r: p.h1.r },
                h2: { x: p.h2.x + shift, r: p.h2.r },
            }));
            const maxR = Math.max(...sil.map((p) => p.r));
            const workLen = sil[sil.length - 1].x;
            setStock((s) => ({
                ...s,
                diameter: Math.min(101.6, Math.ceil(maxR * 2 + 4)),
                length: Math.ceil(shift + workLen + 6),
            }));
            const bb = meshBounds(verts);
            const triCount = verts.length / 9;
            const meshName = file.name.replace(/\.stl$/i, '');
            const baked = bakeForViewer(verts, shift);
            setStlMesh({
                name: meshName,
                key: `${meshName}:${triCount}`,
                ...baked,
            });
            setStlInfo({
                tris: triCount,
                sx: (bb.mx[0] - bb.mn[0]).toFixed(1),
                sy: (bb.mx[1] - bb.mn[1]).toFixed(1),
                sz: (bb.mx[2] - bb.mn[2]).toFixed(1),
                len: workLen.toFixed(1),
                maxDia: (maxR * 2).toFixed(1),
            });
            setPoints(fitted);
            setName(meshName);
            setModeState('stl');
        },
        [pushHistory, stock.grip],
    );

    /** Current state as a project-file slice (mesh travels by key only). */
    const snapshotProject = useCallback((): RotaryProjectSlice => {
        return {
            toolpaths: toolpaths.map(cloneToolpath),
            name,
            mode,
            stlKey: stlMesh?.key,
            pommels: pommels.map((p) => ({ ...p })),
            points: clonePoints(points),
            stock: { ...stock },
            tool: { ...tool },
            ops: {
                ...opsBase,
                groove: { ...opsBase.groove },
                part: { ...opsBase.part },
            },
        };
    }, [name, mode, stlMesh, pommels, points, stock, tool, opsBase, toolpaths]);

    /** Restore a project-file slice (validated); STL mode needs its mesh. */
    const restoreProject = useCallback(
        (slice: unknown) => {
            if (!isRotaryProjectSlice(slice)) {
                return false;
            }
            pushHistory();
            const importedTool = { ...tool, ...slice.tool };
            const importedOps = {
                ...opsBase,
                ...slice.ops,
                groove: { ...opsBase.groove, ...slice.ops.groove },
                part: { ...opsBase.part, ...slice.ops.part },
            };
            const restoredPaths =
                slice.toolpaths ?? legacyToolpaths(importedTool, importedOps);
            setToolpaths(restoredPaths.map(cloneToolpath));
            setOperation(restoredPaths[0]?.operation ?? 'rough');
            setEditingToolpathId(null);
            setToolpathEditorOpen(restoredPaths.length === 0);
            const next = [...slice.points].sort((a, b) => a.x - b.x);
            fitHandles(next);
            setPoints(next);
            setStock({ ...stock, ...slice.stock });
            setTool({ ...tool, ...slice.tool });
            setOpsBase((p) => ({
                ...p,
                ...slice.ops,
                groove: { ...p.groove, ...slice.ops.groove },
                part: { ...p.part, ...slice.ops.part },
            }));
            setPommels(slice.pommels.map((p) => ({ ...p })));
            setName(slice.name);
            setModeState(
                slice.mode === 'stl' && stlMesh?.key === slice.stlKey
                    ? 'stl'
                    : 'profile',
            );
            setSel(-1);
            return true;
        },
        [pushHistory, stock, tool, stlMesh, opsBase],
    );

    return {
        toolpaths,
        programs,
        operation,
        setOperation,
        editingToolpathId,
        toolpathEditorOpen,
        setToolpathEditorOpen,
        startToolpath,
        cancelToolpathEdit,
        saveToolpath,
        editToolpath,
        removeToolpath,
        moveToolpath,
        draftMoves: draft.moves,
        draftFlags: draft.flags,
        name,
        setName,
        mode,
        setMode,
        points,
        sel,
        setSel,
        pommels,
        setPommels,
        stock,
        setStock,
        tool,
        setTool,
        opsBase,
        setOpsBase,
        stlMesh,
        stlInfo,
        showStock,
        setShowStock,
        showPath,
        setShowPath,
        gcode,
        samples,
        moves,
        flags,
        stats,
        compR,
        pushHistory,
        undo,
        redo,
        canUndo: hist.current.undo.length > 0,
        canRedo: hist.current.redo.length > 0,
        commitPoints,
        livePoints,
        deletePoint,
        setPointType,
        nudgePoint,
        setPointValues,
        loadTemplate,
        importStlFile,
        snapshotProject,
        restoreProject,
        generate,
        insertNodeAt: (x: number, r: number) => {
            pushHistory();
            const next = clonePoints(points);
            const { index } = insertNode(next, x, r);
            setPoints(next);
            setModeState('profile');
            setSel(index);
        },
        healPoints: () => {
            const next = clonePoints(points);
            next.sort((a, b) => a.x - b.x);
            fitHandles(next);
            setPoints(next);
        },
    };
}

export interface RotaryStateApi {
    toolpaths: RotaryToolpathEntry[];
    programs: { id: string; label: string; gcode: string }[];
    operation: RotaryOperation;
    setOperation: Dispatch<SetStateAction<RotaryOperation>>;
    editingToolpathId: string | null;
    toolpathEditorOpen: boolean;
    setToolpathEditorOpen: Dispatch<SetStateAction<boolean>>;
    startToolpath(): void;
    cancelToolpathEdit(): void;
    saveToolpath(): void;
    editToolpath(id: string): void;
    removeToolpath(id: string): void;
    moveToolpath(id: string, direction: -1 | 1): void;
    draftMoves: ToolpathMove[];
    draftFlags: RotaryCheck[];
    name: string;
    setName: Dispatch<SetStateAction<string>>;
    mode: RotaryMode;
    setMode: (m: RotaryMode) => void;
    points: ProfilePoint[];
    sel: number;
    setSel: Dispatch<SetStateAction<number>>;
    pommels: PommelZone[];
    setPommels: Dispatch<SetStateAction<PommelZone[]>>;
    stock: RotaryStock;
    setStock: Dispatch<SetStateAction<RotaryStock>>;
    tool: RotaryTool;
    setTool: Dispatch<SetStateAction<RotaryTool>>;
    opsBase: OpsBase;
    setOpsBase: Dispatch<SetStateAction<OpsBase>>;
    stlMesh: StlMesh | null;
    stlInfo: StlInfo | null;
    showStock: boolean;
    setShowStock: Dispatch<SetStateAction<boolean>>;
    showPath: boolean;
    setShowPath: Dispatch<SetStateAction<boolean>>;
    gcode: string;
    samples: ProfileSample[];
    moves: ToolpathMove[];
    flags: RotaryCheck[];
    stats: ToolpathEstimate;
    compR: number;
    pushHistory: () => void;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    commitPoints: (next: ProfilePoint[]) => void;
    livePoints: (next: ProfilePoint[]) => void;
    deletePoint: (i: number) => void;
    setPointType: (t: ProfilePoint['type']) => void;
    nudgePoint: (dx: number, dr: number) => void;
    setPointValues: (which: 'x' | 'r' | 'd', value: number) => void;
    loadTemplate: (templateName: string) => void;
    importStlFile: (file: File) => Promise<void>;
    snapshotProject: () => RotaryProjectSlice;
    restoreProject: (slice: unknown) => boolean;
    generate: () => void;
    insertNodeAt: (x: number, r: number) => void;
    healPoints: () => void;
}

export type UseRotaryState = RotaryStateApi;
export { CHUCK_CLEARANCE };
