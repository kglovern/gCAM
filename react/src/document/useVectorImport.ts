import type { ImportedBitmap } from '../lib/svgImages';
/**
 * Purpose: React hook that owns the VectorImport workflow.
 */
import {
    normalizeLayers,
    DEFAULT_LAYER_ID,
    type DrawingLayer,
} from '../layers/model';
import { useRef, useState } from 'react';
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
    setBitmaps: Dispatch<SetStateAction<ImportedBitmap[]>>;
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

/** Mixed drawing import commits decoded SVG assets and geometry together. */
export function useVectorImport<TLoop extends ImportLoop, TStack>(
    options: UseVectorImportOptions<TLoop, TStack>,
) {
    const [unitImportChoice, setUnitImportChoice] =
        useState<VectorUnitImportChoice | null>(null);
    const requestRevision = useRef(0);
    const importPending = useRef(false);

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
        options.setBitmaps(scaled.bitmaps ?? []);
        options.setBounds(scaled.bounds);
        options.setSelected([]);
        options.setStack([]);
        options.setFileName(scaled.fileName);
        options.setStatus(
            `${scaled.fileName}: ${scaled.entityCount} entities → ${scaled.loops.length} shapes (${scale} mm per drawing unit)`,
        );
        options.onFitView();
    };

    const importVector = async (file: File) => {
        const revision = ++requestRevision.current;
        importPending.current = true;
        options.setStatus(`Loading ${file.name}…`);
        try {
            const result = await importVectorFile(file);
            if (revision !== requestRevision.current) return;
            if (
                result.unitScaleToMm === null ||
                result.unitSource === 'svg-pixels'
            ) {
                setUnitImportChoice({ file, result });
                return;
            }
            commitImport(result, result.unitScaleToMm);
            importPending.current = false;
        } catch (error) {
            if (revision !== requestRevision.current) return;
            importPending.current = false;
            options.setStatus(
                error instanceof Error ? error.message : 'Import failed',
            );
        }
    };

    const resolveUnitImport = async (scaleToMm: number) => {
        if (!unitImportChoice) return;
        const revision = ++requestRevision.current;
        try {
            const result = unitImportChoice.file.name
                .toLowerCase()
                .endsWith('.svg')
                ? await importVectorFile(unitImportChoice.file, scaleToMm)
                : unitImportChoice.result;
            if (revision !== requestRevision.current) return;
            commitImport(result, scaleToMm);
            importPending.current = false;
            setUnitImportChoice(null);
        } catch (error) {
            if (revision === requestRevision.current)
                options.setStatus(
                    error instanceof Error ? error.message : 'Import failed',
                );
        }
    };

    return {
        importVector,
        unitImportChoice,
        resolveUnitImport,
        cancelUnitImport: () => {
            if (importPending.current) options.setStatus('Import cancelled.');
            importPending.current = false;
            requestRevision.current++;
            setUnitImportChoice(null);
        },
    };
}
