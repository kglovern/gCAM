import { useEffect, useMemo, useState } from 'react';
import { cutDepthPreviewInWorker } from '../engine/cam-worker-client';
import type { DepthPreviewImage } from '../lib/cut-depth-preview';
import type { ToolpathStackEntry } from './useToolpathStack';

const operations = [
    'pocket',
    'profile-outside',
    'profile-inside',
    'engrave',
    'chamfer',
    'vcarve',
];
export function useCutDepthPreview(
    stack: ToolpathStackEntry[],
    editingId: string | null,
    stockThickness?: number,
) {
    const source = useMemo(
        () =>
            stack
                .filter(
                    (e) =>
                        e.outputEnabled !== false &&
                        e.id !== editingId &&
                        operations.includes(e.args.operation),
                )
                .map((e) => ({
                    ...e.toolpath,
                    cutterType:
                        e.args.cutterType ??
                        (e.args.operation === 'vcarve' ||
                        e.args.operation === 'chamfer'
                            ? 'v-bit'
                            : 'flat'),
                })),
        [stack, editingId],
    );
    const [state, setState] = useState<{
        source: typeof source;
        stockThickness?: number;
        image?: DepthPreviewImage;
        error?: string;
    } | null>(null);
    useEffect(() => {
        if (!source.length || typeof Worker === 'undefined') return;
        let active = true;
        const job = cutDepthPreviewInWorker(source, stockThickness),
            timer = window.setTimeout(() => job.cancel(), 10000);
        void job.promise
            .then((image) => {
                if (active) setState({ source, stockThickness, image });
            })
            .catch((e) => {
                if (active)
                    setState({ source, stockThickness, error: e.message });
            })
            .finally(() => window.clearTimeout(timer));
        return () => {
            active = false;
            window.clearTimeout(timer);
            job.cancel();
        };
    }, [source, stockThickness]);
    const current =
        state?.source === source && state.stockThickness === stockThickness
            ? state
            : null;
    return {
        image: current?.image,
        error: current?.error,
        pending: typeof Worker !== 'undefined' && source.length > 0 && !current,
    };
}
