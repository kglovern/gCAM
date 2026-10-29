/**
 * Purpose: React hook that owns the BitmapCommands workflow.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { isBitmapFile, loadBitmapFile, placeBitmap } from '../lib/bitmap';
import { BitmapAssetStore } from '../lib/assets';
import { createDocumentId } from '../lib/ids';
import {
    initialSurfacePlacement,
    readSurfaceMeshFile,
    renderHeightmapDataUrl,
    type StoredSurfaceMesh,
} from '../engine/surface-model';
import { parseObj, parseStl } from '../engine/surface-cam';

interface Point {
    x: number;
    y: number;
}

export interface SurfaceUnitImportChoice {
    file: File;
    sizeMm: { x: number; y: number; z: number };
}

interface BitmapLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}

export interface PlacedBitmapRecord {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    dataUrl: string;
    surfaceMesh?: StoredSurfaceMesh;
    surfaceMachinableTopDown?: boolean;
    assetId?: string;
    img?: HTMLImageElement;
}

export interface BitmapImportChoice<TLoop extends BitmapLoop> {
    entry: PlacedBitmapRecord;
    rect: TLoop;
    fileName: string;
}

interface UseBitmapCommandsOptions<
    TLoop extends BitmapLoop,
    TStack,
    TBitmap extends PlacedBitmapRecord,
> {
    bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<TLoop> | null>
    >;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setBitmaps: Dispatch<SetStateAction<TBitmap[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    pushHistory(): void;
    newLoopId(): string;
    withIds(items: { points: Point[] }[]): TLoop[];
    refreshBounds(loops: TLoop[]): void;
    onFitView(): void;
}

/** Bitmap placement and trace replacement commands, independent of App chrome. */
export function useBitmapCommands<
    TLoop extends BitmapLoop,
    TStack,
    TBitmap extends PlacedBitmapRecord,
>(options: UseBitmapCommandsOptions<TLoop, TStack, TBitmap>) {
    const [surfaceUnitImportChoice, setSurfaceUnitImportChoice] =
        useState<SurfaceUnitImportChoice | null>(null);

    const handleBitmapFile = async (file: File) => {
        try {
            const { dataUrl, pixelW, pixelH } = await loadBitmapFile(file);
            const cx = options.bounds
                ? (options.bounds.minX + options.bounds.maxX) / 2
                : 50;
            const cy = options.bounds
                ? (options.bounds.minY + options.bounds.maxY) / 2
                : 50;
            const placed = placeBitmap(pixelW, pixelH, cx, cy);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () =>
                    reject(new Error('Could not decode image.'));
                img.src = dataUrl;
            });
            const assetId = createDocumentId('asset');
            const entry: PlacedBitmapRecord = {
                id: createDocumentId('bitmap'),
                x: placed.x,
                y: placed.y,
                w: placed.wMm,
                h: placed.hMm,
                dataUrl,
                assetId,
                img,
            };
            void new BitmapAssetStore().put(assetId, file).catch(() => {
                // Export data remains portable when IndexedDB is unavailable.
            });
            const rect = {
                id: options.newLoopId(),
                bitmapId: entry.id,
                points: [
                    { x: placed.x, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y },
                ],
            } as TLoop;
            options.setBitmapImportChoice({ entry, rect, fileName: file.name });
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Bitmap load failed',
            );
        }
    };

    const importSurfaceModel = async (file: File, units: 'mm' | 'inch') => {
        try {
            const surfaceMesh = await readSurfaceMeshFile(file, units);
            const { dataUrl, machinableTopDown, machineUp, orientedBounds } =
                renderHeightmapDataUrl(surfaceMesh);
            surfaceMesh.machineUp = machineUp;
            const cx = options.bounds
                ? (options.bounds.minX + options.bounds.maxX) / 2
                : 50;
            const cy = options.bounds
                ? (options.bounds.minY + options.bounds.maxY) / 2
                : 50;
            // Model dimensions are physical units, not preview-image pixels.
            // An edge-on preview has no usable XY dimensions yet; hold a
            // placeholder only inside the setup dialog until the user applies
            // a valid machining direction.
            const placed = machinableTopDown
                ? initialSurfacePlacement(orientedBounds, cx, cy)
                : { x: cx - 12.5, y: cy - 12.5, wMm: 25, hMm: 25 };
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () =>
                    reject(
                        new Error('Could not decode model heightmap preview.'),
                    );
                img.src = dataUrl;
            });
            const entry: PlacedBitmapRecord = {
                id: createDocumentId('surface'),
                x: placed.x,
                y: placed.y,
                w: placed.wMm,
                h: placed.hMm,
                dataUrl,
                surfaceMesh,
                surfaceMachinableTopDown: machinableTopDown,
                img,
            };
            const rect = {
                id: options.newLoopId(),
                bitmapId: entry.id,
                points: [
                    { x: placed.x, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y },
                ],
            } as TLoop;
            options.setBitmapImportChoice({ entry, rect, fileName: file.name });
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : '3D model import failed.',
            );
        }
    };

    const handleSurfaceModelFile = async (file: File) => {
        try {
            // Parse once before asking for units so the user can compare both
            // physical-size interpretations. readSurfaceMeshFile reparses on
            // confirmation, but preserves the clear unit choice as the source
            // of truth for scaling and stored project data.
            const mesh = /\.obj$/i.test(file.name)
                ? parseObj(await file.text(), file.name)
                : parseStl(await file.arrayBuffer(), file.name);
            setSurfaceUnitImportChoice({
                file,
                sizeMm: {
                    x: mesh.bounds.maxX - mesh.bounds.minX,
                    y: mesh.bounds.maxY - mesh.bounds.minY,
                    z: mesh.bounds.maxZ - mesh.bounds.minZ,
                },
            });
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : '3D model import failed.',
            );
        }
    };

    const resolveSurfaceModelUnits = (units: 'mm' | 'inch') => {
        if (!surfaceUnitImportChoice) return;
        const { file } = surfaceUnitImportChoice;
        setSurfaceUnitImportChoice(null);
        void importSurfaceModel(file, units);
    };

    const cancelSurfaceModelUnits = () => setSurfaceUnitImportChoice(null);

    const updateSurfaceSetupOrientation = async (
        choice: BitmapImportChoice<TLoop>,
        machineUp: [number, number, number],
    ) => {
        try {
            const originalMesh = choice.entry.surfaceMesh;
            if (!originalMesh) return;
            const surfaceMesh: StoredSurfaceMesh = {
                ...originalMesh,
                machineUp,
            };
            const { dataUrl, machinableTopDown, orientedBounds } =
                renderHeightmapDataUrl(surfaceMesh);
            const image = new Image();
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () =>
                    reject(
                        new Error(
                            'Could not decode the updated model heightmap preview.',
                        ),
                    );
                image.src = dataUrl;
            });
            const centerX = choice.entry.x + choice.entry.w / 2;
            const centerY = choice.entry.y + choice.entry.h / 2;
            const placed = machinableTopDown
                ? initialSurfacePlacement(orientedBounds, centerX, centerY)
                : { x: centerX - 12.5, y: centerY - 12.5, wMm: 25, hMm: 25 };
            const entry: PlacedBitmapRecord = {
                ...choice.entry,
                x: placed.x,
                y: placed.y,
                w: placed.wMm,
                h: placed.hMm,
                dataUrl,
                img: image,
                surfaceMesh,
                surfaceMachinableTopDown: machinableTopDown,
            };
            const rect = {
                ...choice.rect,
                points: [
                    { x: placed.x, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y },
                ],
            } as TLoop;
            options.setBitmapImportChoice({ ...choice, entry, rect });
            options.setStatus(
                'Setup direction updated. Heightmap and draped 3-axis CAM coordinates are aligned.',
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : 'Could not update model setup direction.',
            );
        }
    };

    const commitBitmapPlacement = (choice: BitmapImportChoice<TLoop>) => {
        options.pushHistory();
        options.setBitmaps((current) => [...current, choice.entry as TBitmap]);
        options.setLoops((current) => {
            const next = [...current, choice.rect];
            options.setSelected([choice.rect.id]);
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setFileName(choice.fileName);
        options.onFitView();
        options.setStatus(
            choice.entry.surfaceMesh
                ? `3D model ${choice.fileName} placed as a 2D heightmap. Resize/rotate it on the canvas, then add a surface CAM operation.`
                : `Bitmap ${choice.fileName} placed — choose a raster, wavy, halftone, or heightmap toolpath.`,
        );
    };

    const commitTraced = (
        traced: { points: Point[] }[],
        replaceBitmapId?: string,
    ) => {
        if (!traced.length) {
            options.setStatus('Trace found no shapes — try a darker image.');
            return;
        }
        options.pushHistory();
        const stamped = options.withIds(traced);
        options.setLoops((current) => {
            const retained = replaceBitmapId
                ? current.filter((loop) => loop.bitmapId !== replaceBitmapId)
                : current;
            const next = [...retained, ...stamped];
            options.setSelected(stamped.map((loop) => loop.id));
            options.setStack([]);
            options.setDraftPreview([]);
            options.refreshBounds(next);
            return next;
        });
        if (replaceBitmapId) {
            options.setBitmaps((current) =>
                current.filter((bitmap) => bitmap.id !== replaceBitmapId),
            );
        }
        options.setStatus(`Traced ${traced.length} shapes — bitmap replaced.`);
    };

    return {
        handleBitmapFile,
        handleSurfaceModelFile,
        surfaceUnitImportChoice,
        resolveSurfaceModelUnits,
        cancelSurfaceModelUnits,
        updateSurfaceSetupOrientation,
        commitBitmapPlacement,
        commitTraced,
        isBitmapFile,
    };
}
