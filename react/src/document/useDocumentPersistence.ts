/**
 * Purpose: React hook that owns the DocumentPersistence workflow.
 */
import { hasLayerContent, type DrawingLayer } from '../layers/model';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ViewLoop } from '../canvas/types';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import { ProjectAutosaveStore } from '../lib/autosave';
import type { Guide } from '../lib/guides';
import type { DocumentSnapshot } from './useDocumentState';
import type { PlacedBitmapRecord } from './useBitmapCommands';
import { normalizeJobStock, type JobStock } from '../job/stock';
import {
    hasPendingRegeneration,
    regenerateStack,
} from '../toolpaths/regenerate-stack';

type AppSnapshot = DocumentSnapshot<
    ViewLoop,
    ToolpathStackEntry,
    PlacedBitmapRecord,
    Guide
>;

interface UseDocumentPersistenceOptions {
    layers?: DrawingLayer[];
    activeLayerId?: string;
    loops: ViewLoop[];
    selected: string[];
    hidden: string[];
    stack: ToolpathStackEntry[];
    bitmaps: PlacedBitmapRecord[];
    guides: Guide[];
    stock: JobStock;
    fileName: string;
    onFitView(): void;
    restore(snapshot: AppSnapshot): void;
    setBitmaps: Dispatch<SetStateAction<PlacedBitmapRecord[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStock: Dispatch<SetStateAction<JobStock>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Local recovery, debounced autosave and bitmap image rehydration. */
export function useDocumentPersistence({
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
}: UseDocumentPersistenceOptions) {
    const autosaveStoreRef = useRef(new ProjectAutosaveStore());
    const [recoveryChecked, setRecoveryChecked] = useState(false);
    const currentDocument = [
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
    ];
    const initialDocumentRef = useRef(currentDocument);
    const latestDocumentRef = useRef(currentDocument);
    latestDocumentRef.current = currentDocument;

    useEffect(() => {
        let cancelled = false;
        void autosaveStoreRef.current
            .load()
            .then(async (recovery) => {
                if (cancelled || !recovery) return;
                // Autosaves keep full geometry; only entries that failed to rebuild on import stay pending.
                if (hasPendingRegeneration(recovery.snapshot.stack))
                    recovery.snapshot.stack = (
                        await regenerateStack(recovery.snapshot.stack)
                    ).stack;
                if (cancelled) return;
                // A newly opened or edited document takes priority over startup recovery.
                if (
                    initialDocumentRef.current.some(
                        (value, index) =>
                            value !== latestDocumentRef.current[index],
                    )
                )
                    return;
                if (
                    !recovery.snapshot.loops.length &&
                    !recovery.snapshot.stack.length &&
                    !recovery.snapshot.guides.length &&
                    !recovery.snapshot.bitmaps.length &&
                    recovery.snapshot.stock?.origin !== 'center' &&
                    !hasLayerContent(recovery.snapshot.layers)
                ) {
                    return;
                }
                restore({
                    layers: recovery.snapshot.layers,
                    activeLayerId: recovery.snapshot.activeLayerId,
                    loops: recovery.snapshot.loops as ViewLoop[],
                    selected: recovery.snapshot.selected,
                    hidden: recovery.snapshot.hidden,
                    stack: recovery.snapshot.stack as ToolpathStackEntry[],
                    bitmaps: recovery.snapshot.bitmaps as PlacedBitmapRecord[],
                    guides: recovery.snapshot.guides,
                    stock: normalizeJobStock(recovery.snapshot.stock),
                });
                onFitView();
                setFileName(recovery.snapshot.fileName);
                setStatus('Recovered the last local project.');
            })
            .catch(() => {
                // Private-mode browsers can deny IndexedDB. Export still works.
            })
            .finally(() => {
                if (!cancelled) setRecoveryChecked(true);
            });
        return () => {
            cancelled = true;
        };
        // Recovery is intentionally a one-time startup read; document actions
        // replace their closures as state changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!recoveryChecked) return;
        if (
            initialDocumentRef.current.every(
                (value, index) => value === latestDocumentRef.current[index],
            )
        )
            return;
        const timer = window.setTimeout(() => {
            void autosaveStoreRef.current
                .save({
                    layers,
                    activeLayerId,
                    loops,
                    selected,
                    hidden,
                    stack,
                    bitmaps: bitmaps.map(({ img, ...bitmap }) => bitmap),
                    guides,
                    stock,
                    fileName,
                })
                .catch(() => {
                    // A full quota must not interrupt CAM work.
                });
        }, 600);
        return () => window.clearTimeout(timer);
    }, [
        recoveryChecked,
        layers,
        activeLayerId,
        bitmaps,
        fileName,
        guides,
        hidden,
        loops,
        selected,
        stack,
        stock,
    ]);

    useEffect(() => {
        let cancelled = false;
        for (const bitmap of bitmaps) {
            if (bitmap.img instanceof HTMLImageElement) continue;
            const image = new Image();
            image.onload = () => {
                if (cancelled) return;
                setBitmaps((current) =>
                    current.map((entry) =>
                        entry.id === bitmap.id
                            ? { ...entry, img: image }
                            : entry,
                    ),
                );
            };
            image.src = bitmap.dataUrl;
        }
        return () => {
            cancelled = true;
        };
        // Rehydrate only when undo/import changes image availability.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        bitmaps
            .map(
                (bitmap) =>
                    `${bitmap.id}:${bitmap.img instanceof HTMLImageElement}`,
            )
            .join(','),
    ]);
}
