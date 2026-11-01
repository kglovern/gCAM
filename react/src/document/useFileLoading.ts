/**
 * Purpose: React hook that owns the FileLoading workflow.
 */
import type { Dispatch, SetStateAction } from 'react';

interface UseFileLoadingOptions {
    cancelPendingImport?(): void;
    isBitmapFile(file: File): boolean;
    loadBitmap(file: File): Promise<void>;
    isSurfaceModelFile(file: File): boolean;
    loadSurfaceModel(file: File): Promise<void>;
    importVector(file: File): Promise<void>;
    setStatus: Dispatch<SetStateAction<string>>;
    setLoadingSample: Dispatch<SetStateAction<boolean>>;
}

/** Routes local source files and the bundled sample through import features. */
export function useFileLoading(options: UseFileLoadingOptions) {
    const handleFiles = async (files: FileList | File[] | null) => {
        const file = files?.[0];
        if (!file) return;
        options.cancelPendingImport?.();
        if (options.isSurfaceModelFile(file)) {
            await options.loadSurfaceModel(file);
            return;
        }
        if (options.isBitmapFile(file)) {
            await options.loadBitmap(file);
            return;
        }
        await options.importVector(file);
    };

    const handleLoadSample = async () => {
        options.cancelPendingImport?.();
        options.setLoadingSample(true);
        options.setStatus('Loading Tic-Tac-Toe sample…');
        try {
            const response = await fetch('samples/TicTacToe.dxf');
            if (!response.ok) throw new Error('Sample not found.');
            const text = await response.text();
            await handleFiles([
                new File([text], 'TicTacToe.dxf', {
                    type: 'application/dxf',
                }),
            ]);
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : 'Could not load sample.',
            );
        } finally {
            options.setLoadingSample(false);
        }
    };

    return { handleFiles, handleLoadSample };
}
