/**
 * Purpose: React hook that owns the DocumentWorkspace workflow.
 */
import { useLayerCommands } from '../layers/useLayerCommands';
import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ViewBounds, ViewLoop } from '../canvas/types';
import { loopBounds } from '../lib/engine';
import { createDocumentId } from '../lib/ids';
import { cloneHistoryData } from '../lib/history';
import type { Guide } from '../lib/guides';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import {
    type BitmapImportChoice,
    type PlacedBitmapRecord,
    useBitmapCommands,
} from './useBitmapCommands';
import { useDocumentPersistence } from './useDocumentPersistence';
import { useDocumentState } from './useDocumentState';
import { useVectorImport } from './useVectorImport';
import type { JobStock } from '../job/stock';

type PreviewPaths = { x: number; y: number }[][];

interface DocumentWorkspaceOptions {
    initialStock?: JobStock;
    setStatus: Dispatch<SetStateAction<string>>;
    setDraftPreview: Dispatch<SetStateAction<PreviewPaths>>;
    onFitView(): void;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
}

/** Persistent document model plus bitmap/vector import commands. */
export function useDocumentWorkspace({
    initialStock,
    setStatus,
    setDraftPreview,
    onFitView,
    setBitmapImportChoice,
}: DocumentWorkspaceOptions) {
    const [bounds, setBounds] = useState<ViewBounds | null>(null);
    const [fileName, setFileName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const projectRef = useRef<HTMLInputElement>(null);
    const document = useDocumentState<
        ViewLoop,
        ToolpathStackEntry,
        PlacedBitmapRecord,
        Guide
    >({
        initialStock,
        clone: (snapshot) => ({
            ...snapshot,
            loops: snapshot.loops.map((loop) => ({
                ...loop,
                points: loop.points.map((point) => ({ ...point })),
            })),
            selected: [...snapshot.selected],
            hidden: [...snapshot.hidden],
            stack: cloneHistoryData(snapshot.stack),
            bitmaps: snapshot.bitmaps.map(({ img, ...bitmap }) => ({
                ...bitmap,
            })),
            guides: snapshot.guides.map((guide) => ({ ...guide })),
            stock: { ...snapshot.stock },
        }),
        onRestore: (snapshot) => setBounds(loopBounds(snapshot.loops)),
    });
    const {
        layers,
        setLayers,
        activeLayerId,
        setActiveLayerId,
        loops,
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
        push: pushHistory,
        restore,
        undo: undoDocument,
        redo: redoDocument,
        canUndo,
        canRedo,
    } = document;
    const layerCommands = useLayerCommands({
        loops,
        layers,
        activeLayerId,
        selected,
        hidden,
        setLoops,
        setLayers,
        setActiveLayerId,
        setSelected,
        setHidden,
        pushHistory,
    });
    const newLoopId = () => createDocumentId('loop');
    const withIds = (
        items: { points: { x: number; y: number }[] }[],
    ): ViewLoop[] =>
        items.map((item) => ({
            id: newLoopId(),
            layerId: activeLayerId,
            ...item,
        }));
    const refreshBounds = (next: ViewLoop[]) => setBounds(loopBounds(next));

    useDocumentPersistence({
        layers,
        activeLayerId,
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        stock,
        fileName,
        onFitView,
        restore,
        setBitmaps,
        setFileName,
        setStock,
        setStatus,
    });

    const bitmapCommands = useBitmapCommands<
        ViewLoop,
        ToolpathStackEntry,
        PlacedBitmapRecord
    >({
        bounds,
        setBitmapImportChoice,
        setLoops,
        setSelected,
        setStack,
        setBitmaps,
        setFileName,
        setStatus,
        setDraftPreview,
        onFitView,
        pushHistory,
        newLoopId,
        withIds,
        refreshBounds,
    });
    const {
        importVector,
        unitImportChoice,
        resolveUnitImport,
        cancelUnitImport,
    } = useVectorImport<ViewLoop, ToolpathStackEntry>({
        setLoops,
        setLayers,
        setActiveLayerId,
        setSelected,
        setStack,
        setFileName,
        setStatus,
        setBounds,
        pushHistory,
        newLoopId,
        onFitView,
    });

    return {
        layerCommands,
        bounds,
        setBounds,
        fileName,
        setFileName,
        fileRef,
        projectRef,
        layers,
        setLayers,
        activeLayerId,
        setActiveLayerId,
        loops,
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
        pushHistory,
        restore,
        undoDocument,
        redoDocument,
        canUndo,
        canRedo,
        newLoopId,
        withIds,
        refreshBounds,
        importVector,
        unitImportChoice,
        resolveUnitImport,
        cancelUnitImport,
        ...bitmapCommands,
    };
}
