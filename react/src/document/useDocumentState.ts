/**
 * Purpose: React hook that owns the DocumentState workflow.
 */
import { useRef, useState } from 'react';
import {
    DEFAULT_LAYER_ID,
    normalizeLayers,
    type DrawingLayer,
} from '../layers/model';
import {
    createHistory,
    pushHistory,
    redoHistory,
    undoHistory,
} from '../lib/history';
import { DEFAULT_JOB_STOCK, type JobStock } from '../job/stock';

export interface DocumentSnapshot<TLoop, TStack, TBitmap, TGuide> {
    loops: TLoop[];
    selected: string[];
    hidden: string[];
    stack: TStack[];
    bitmaps: TBitmap[];
    guides: TGuide[];
    stock: JobStock;
    layers?: DrawingLayer[];
    activeLayerId?: string;
}

interface DocumentStateOptions<TLoop, TStack, TBitmap, TGuide> {
    initialStock?: JobStock;
    clone(
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ): DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>;
    historyLimit?: number;
    onRestore?: (
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ) => void;
}

/**
 * Owns mutable document entities and undo/redo. UI panels and canvas tools
 * consume this boundary instead of creating competing document state.
 */
export function useDocumentState<TLoop, TStack, TBitmap, TGuide>(
    options: DocumentStateOptions<TLoop, TStack, TBitmap, TGuide>,
) {
    const [layers, setLayers] = useState<DrawingLayer[]>(() =>
        normalizeLayers([], []),
    );
    const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER_ID);
    const [loops, setLoops] = useState<TLoop[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [stack, setStack] = useState<TStack[]>([]);
    const [bitmaps, setBitmaps] = useState<TBitmap[]>([]);
    const [guides, setGuides] = useState<TGuide[]>([]);
    const [stock, setStock] = useState<JobStock>(
        () => options.initialStock ?? DEFAULT_JOB_STOCK,
    );
    const [, setVersion] = useState(0);
    const stateRef = useRef<DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>>({
        layers,
        activeLayerId,
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        stock,
    });
    stateRef.current = {
        layers,
        activeLayerId,
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        stock,
    };
    const historyRef = useRef(
        createHistory(options.historyLimit ?? 60, options.clone),
    );

    const push = () => {
        pushHistory(historyRef.current, stateRef.current);
        setVersion((value) => value + 1);
    };

    const restore = (
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ) => {
        const restoredLayers = normalizeLayers(
            snapshot.layers,
            snapshot.loops as { layerId?: string }[],
        );
        setLayers(restoredLayers);
        setActiveLayerId(
            restoredLayers.some((layer) => layer.id === snapshot.activeLayerId)
                ? snapshot.activeLayerId!
                : DEFAULT_LAYER_ID,
        );
        setLoops(snapshot.loops);
        setSelected(snapshot.selected);
        setHidden(snapshot.hidden);
        setStack(snapshot.stack);
        setBitmaps(snapshot.bitmaps);
        setGuides(snapshot.guides);
        setStock(snapshot.stock);
        options.onRestore?.(snapshot);
    };

    const undo = () => {
        const snapshot = undoHistory(historyRef.current, stateRef.current);
        if (!snapshot) return false;
        restore(snapshot);
        setVersion((value) => value + 1);
        return true;
    };

    const redo = () => {
        const snapshot = redoHistory(historyRef.current, stateRef.current);
        if (!snapshot) return false;
        restore(snapshot);
        setVersion((value) => value + 1);
        return true;
    };

    return {
        layers,
        activeLayerId,
        loops,
        setLayers,
        setActiveLayerId,
        setLoops,
        selected,
        setSelected,
        hidden,
        setHidden,
        stack,
        setStack,
        bitmaps,
        setBitmaps,
        guides,
        setGuides,
        stock,
        setStock,
        push,
        restore,
        undo,
        redo,
        canUndo: historyRef.current.undo.length > 0,
        canRedo: historyRef.current.redo.length > 0,
    };
}
