/**
 * Purpose: React hook that owns the VectorImport workflow.
 */
import {
    normalizeLayers,
    DEFAULT_LAYER_ID,
    type DrawingLayer,
} from '../layers/model';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    importVectorFile,
    scaleImportResult,
    type ImportResult,
} from '../lib/import';

export interface VectorUnitImportChoice {
    file: File;
    result: ImportResult;
}

interface ImportLoop {
    id: string;
    points: { x: number; y: number }[];
}

interface UseVectorImportOptions<TLoop extends ImportLoop, TStack> {
    setLayers?: Dispatch<SetStateAction<DrawingLayer[]>>;
    setActiveLayerId?: Dispatch<SetStateAction<string>>;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setBounds: Dispatch<
        SetStateAction<{
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        } | null>
    >;
    pushHistory(): void;
    newLoopId(): string;
    onFitView(): void;
}

/** Vector file import command; bitmap routing intentionally remains at the shell. */
export function useVectorImport<TLoop extends ImportLoop, TStack>(
    options: UseVectorImportOptions<TLoop, TStack>,
) {
    const [unitImportChoice, setUnitImportChoice] =
        useState<VectorUnitImportChoice | null>(null);

    const commitImport = (result: ImportResult, scale: number) => {
        const scaled = scaleImportResult(result, scale);
        options.pushHistory();
        const loops = scaled.loops.map(
            (loop) =>
                ({ ...loop, id: loop.id ?? options.newLoopId() }) as TLoop,
        );
        const layers = normalizeLayers(scaled.layers, scaled.loops);
        options.setLayers?.(layers);
        options.setActiveLayerId?.(
            layers.find((layer) => layer.id !== DEFAULT_LAYER_ID)?.id ??
                DEFAULT_LAYER_ID,
        );
        options.setLoops(loops);
        options.setBounds(scaled.bounds);
        options.setSelected([]);
        options.setStack([]);
        options.setFileName(scaled.fileName);
        options.setStatus(
            `${scaled.fileName}: ${scaled.entityCount} entities → ${scaled.loops.length} vectors (${scale} mm per drawing unit)`,
        );
        options.onFitView();
    };

    const importVector = async (file: File) => {
        try {
            const result = await importVectorFile(file);
            if (
                result.unitScaleToMm === null ||
                result.unitSource === 'svg-pixels'
            ) {
                setUnitImportChoice({ file, result });
                return;
            }
            commitImport(result, result.unitScaleToMm);
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Import failed',
            );
        }
    };

    const resolveUnitImport = (scaleToMm: number) => {
        if (!unitImportChoice) return;
        commitImport(unitImportChoice.result, scaleToMm);
        setUnitImportChoice(null);
    };

    return {
        importVector,
        unitImportChoice,
        resolveUnitImport,
        cancelUnitImport: () => setUnitImportChoice(null),
    };
}
