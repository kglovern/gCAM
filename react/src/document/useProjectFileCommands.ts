/**
 * Purpose: React hook that owns the ProjectFileCommands workflow.
 */
import {
    hasLayerContent,
    normalizeLayers,
    DEFAULT_LAYER_ID,
    type DrawingLayer,
} from '../layers/model';
import type { Dispatch, SetStateAction } from 'react';
import type { BitmapLike, GuideLike, StackEntryLike } from '../lib/project';
import { downloadProject, readProjectFile } from './projectFile';
import type { JobStock } from '../job/stock';
import { normalizeJobStock } from '../job/stock';

interface IdentifiedLoop {
    id: string;
    points: { x: number; y: number }[];
}

interface ProjectBitmap extends BitmapLike {
    img?: HTMLImageElement;
}

interface UseProjectFileCommandsOptions<
    TLoop extends IdentifiedLoop,
    TStack extends StackEntryLike,
    TBitmap extends ProjectBitmap,
    TGuide extends GuideLike,
> {
    layers?: DrawingLayer[];
    activeLayerId?: string;
    setLayers?: Dispatch<SetStateAction<DrawingLayer[]>>;
    setActiveLayerId?: Dispatch<SetStateAction<string>>;
    loops: TLoop[];
    selected: string[];
    hidden: string[];
    stack: TStack[];
    bitmaps: TBitmap[];
    guides: TGuide[];
    stock: JobStock;
    fileName: string;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setHidden: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setBitmaps: Dispatch<SetStateAction<TBitmap[]>>;
    setGuides: Dispatch<SetStateAction<TGuide[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStock: Dispatch<SetStateAction<JobStock>>;
    setStatus: Dispatch<SetStateAction<string>>;
    pushHistory(): void;
    newLoopId(): string;
    onLoadedBounds(loops: TLoop[]): void;
}

/** Browser project-file commands, kept separate from application chrome. */
export function useProjectFileCommands<
    TLoop extends IdentifiedLoop,
    TStack extends StackEntryLike,
    TBitmap extends ProjectBitmap,
    TGuide extends GuideLike,
>(options: UseProjectFileCommandsOptions<TLoop, TStack, TBitmap, TGuide>) {
    const handleExportProject = () => {
        if (
            !options.loops.length &&
            !options.stack.length &&
            !hasLayerContent(options.layers)
        ) {
            options.setStatus(
                'Nothing to export — import or draw something first.',
            );
            return;
        }
        const name = downloadProject({
            layers: options.layers,
            activeLayerId: options.activeLayerId,
            loops: options.loops,
            selected: options.selected,
            hidden: options.hidden,
            stack: options.stack,
            bitmaps: options.bitmaps.map(({ img, ...bitmap }) => bitmap),
            guides: options.guides,
            stock: options.stock,
            fileName: options.fileName,
        });
        options.setStatus(`Exported ${name}.`);
    };

    const handleImportProject = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        try {
            const snapshot = await readProjectFile(file);
            options.pushHistory();
            const loops = snapshot.loops.map(
                (loop) =>
                    ({ ...loop, id: loop.id ?? options.newLoopId() }) as TLoop,
            );
            const layers = normalizeLayers(snapshot.layers, snapshot.loops);
            options.setLayers?.(layers);
            options.setActiveLayerId?.(
                layers.some((layer) => layer.id === snapshot.activeLayerId)
                    ? snapshot.activeLayerId!
                    : DEFAULT_LAYER_ID,
            );
            options.setLoops(loops);
            options.setSelected(
                snapshot.selected.filter((id) =>
                    loops.some((loop) => loop.id === id),
                ),
            );
            options.setHidden(snapshot.hidden ?? []);
            options.setStack(snapshot.stack as TStack[]);
            options.setBitmaps(snapshot.bitmaps as unknown as TBitmap[]);
            options.setGuides(snapshot.guides as TGuide[]);
            options.setStock(normalizeJobStock(snapshot.stock));
            options.setFileName(snapshot.fileName);
            options.onLoadedBounds(loops);
            options.setStatus(`Loaded ${file.name}.`);
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Could not load',
            );
        }
    };

    return { handleExportProject, handleImportProject };
}
