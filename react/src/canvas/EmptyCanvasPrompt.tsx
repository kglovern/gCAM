/**
 * Purpose: Implementation module for EmptyCanvasPrompt in the react domain.
 */
interface EmptyCanvasPromptProps {
    onNewCanvas: () => void;
    onImport: () => void;
    onLoadSample: () => void;
    loadingSample: boolean;
}

/** First-run actions shown over an otherwise empty editor canvas. */
export function EmptyCanvasPrompt({
    onNewCanvas,
    onImport,
    onLoadSample,
    loadingSample,
}: EmptyCanvasPromptProps) {
    return (
        <div className="absolute inset-0 z-10 grid place-items-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white/95 px-6 py-5 text-center shadow-lg dark:border-robin-900 dark:bg-dark/95">
                <div className="font-medium text-slate-900 dark:text-white">
                    How would you like to begin?
                </div>
                <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                    <button
                        onClick={onNewCanvas}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark-lighter"
                    >
                        New Empty Canvas
                    </button>
                    <button
                        onClick={onImport}
                        className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                    >
                        Open drawing or model
                    </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Open a DXF/SVG drawing, STL/OBJ model, or bitmap image, or
                    drag it onto the canvas. Trace a bitmap into vectors or use
                    it directly for artistic effects.
                </p>
                <button
                    onClick={onLoadSample}
                    disabled={loadingSample}
                    className="mt-1 rounded border border-transparent px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:border-robin-900 dark:hover:text-slate-200"
                >
                    {loadingSample ? 'Loading…' : 'Try Tic-Tac-Toe Sample'}
                </button>
            </div>
        </div>
    );
}
