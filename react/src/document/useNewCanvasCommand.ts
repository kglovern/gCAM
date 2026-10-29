/**
 * Purpose: React hook that owns the NewCanvasCommand workflow.
 */
import {
    DEFAULT_LAYER_ID,
    hasLayerContent,
    normalizeLayers,
    type DrawingLayer,
} from '../layers/model';
import type { Dispatch, SetStateAction } from 'react';
import { IMPORT_START_STATUS } from '../lib/import';
import { DEFAULT_JOB_STOCK, type JobStock } from '../job/stock';

interface UseNewCanvasCommandOptions<TLoop, TStack, TBitmap, TGuide> {
    defaultStock?: JobStock;
    setStock: Dispatch<SetStateAction<JobStock>>;
    setLayers?: Dispatch<SetStateAction<DrawingLayer[]>>;
    setActiveLayerId?: Dispatch<SetStateAction<string>>;
    layers?: DrawingLayer[];
    loops: TLoop[];
    stack: TStack[];
    bitmaps: TBitmap[];
    guides: TGuide[];
    pushHistory(): void;
    setEmptyStateDismissed: Dispatch<SetStateAction<boolean>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setHidden: Dispatch<SetStateAction<string[]>>;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setBounds(value: null): void;
    setBitmaps: Dispatch<SetStateAction<TBitmap[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setGuides: Dispatch<SetStateAction<TGuide[]>>;
    setTabMode: Dispatch<SetStateAction<boolean>>;
    setEditingId: Dispatch<SetStateAction<string | null>>;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setDraftProgress: Dispatch<
        SetStateAction<{ percent: number; label: string } | null>
    >;
    setOffsetPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setBooleanPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setActiveTool: Dispatch<
        SetStateAction<'select' | 'draw' | 'trim' | 'preview'>
    >;
    setDrawTool(value: null): void;
    clearTransform(): void;
    setFileName: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Reset all document/UI state behind one deliberately destructive command. */
export function useNewCanvasCommand<TLoop, TStack, TBitmap, TGuide>(
    options: UseNewCanvasCommandOptions<TLoop, TStack, TBitmap, TGuide>,
) {
    const handleNewCanvas = () => {
        const hasWork =
            options.loops.length > 0 ||
            options.stack.length > 0 ||
            options.bitmaps.length > 0 ||
            options.guides.length > 0 ||
            hasLayerContent(options.layers);
        if (
            hasWork &&
            !window.confirm('Clear the current shapes and toolpaths?')
        ) {
            return;
        }
        if (hasWork) options.pushHistory();
        options.setEmptyStateDismissed(true);
        options.setSelected([]);
        options.setHidden([]);
        options.setLayers?.(normalizeLayers([], []));
        options.setActiveLayerId?.(DEFAULT_LAYER_ID);
        options.setLoops([]);
        options.setBounds(null);
        options.setBitmaps([]);
        options.setStack([]);
        options.setGuides([]);
        options.setStock({ ...(options.defaultStock ?? DEFAULT_JOB_STOCK) });
        options.setTabMode(false);
        options.setEditingId(null);
        options.setDraftPreview([]);
        options.setDraftProgress(null);
        options.setOffsetPreview([]);
        options.setBooleanPreview([]);
        options.setActiveTool('select');
        options.setDrawTool(null);
        options.clearTransform();
        options.setFileName('');
        options.setStatus(IMPORT_START_STATUS);
    };

    return { handleNewCanvas };
}
