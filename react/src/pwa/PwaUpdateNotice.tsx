import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { applyPwaUpdate, usePwa } from './client';

export function PwaUpdateNotice() {
    const { updateAvailable } = usePwa();
    const [dismissed, setDismissed] = useState(false);
    if (!updateAvailable || dismissed) return null;
    return (
        <div
            role="status"
            className="fixed bottom-20 right-3 z-[80] max-w-[calc(100vw-24px)] rounded-lg border border-robin-300 bg-white p-3 text-sm text-slate-700 shadow-xl md:bottom-4 dark:border-robin-700 dark:bg-dark dark:text-slate-200"
        >
            <div className="flex items-center justify-between gap-3">
                <span>A gCAM update is ready.</span>
                <button
                    type="button"
                    aria-label="Update later"
                    onClick={() => setDismissed(true)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded"
                >
                    <X size={18} />
                </button>
            </div>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-300">
                Save your project before restarting.
            </p>
            <button
                type="button"
                onClick={applyPwaUpdate}
                className="inline-flex min-h-11 items-center gap-2 rounded bg-robin-500 px-3 py-2 text-white"
            >
                <RefreshCw size={16} />
                Restart to update
            </button>
        </div>
    );
}
