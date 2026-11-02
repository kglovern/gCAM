import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPanel } from './floating/FloatingPanel';
import {
    LAYOUT_ACTIONS,
    type LayoutAction,
    type LayoutResult,
    type LayoutSource,
} from '../lib/arrange-artwork';
import { arrangeArtworkInWorker } from '../engine/cam-worker-client';
import { operationsTouchingShapes } from '../lib/vector-bitmap-document';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
export function ArrangePanel({
    source,
    stack,
    onClose,
    onPreview,
    onApply,
}: {
    source: LayoutSource;
    stack: ToolpathStackEntry[];
    onClose(): void;
    onPreview(points: { x: number; y: number }[][]): void;
    onApply(result: LayoutResult): void;
}) {
    const [action, setAction] = useState<LayoutAction>('left'),
        [result, setResult] = useState<LayoutResult | null>(null),
        [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setResult(null);
        setError('');
        const job = arrangeArtworkInWorker(source, action);
        void job.promise
            .then((r) => {
                if (active) setResult(r);
            })
            .catch((e) => {
                if (active) setError(e.message);
            });
        return () => {
            active = false;
            job.cancel();
        };
    }, [source, action]);
    useEffect(() => {
        const changed = new Set(result?.changedIds);
        onPreview(
            result?.shapes
                .filter((s) => changed.has(s.id))
                .map((s) => s.points) ?? [],
        );
    }, [result, onPreview]);
    useEffect(() => () => onPreview([]), [onPreview]);
    const affected = useMemo(() => {
        const changed = new Set(result?.changedIds);
        return operationsTouchingShapes(
            stack,
            source.shapes.filter((s) => changed.has(s.id)),
        ).length;
    }, [source, stack, result]);
    return createPortal(
        <div className="pointer-events-none fixed inset-x-2 bottom-2 top-20 z-40">
            <FloatingPanel
                title="Arrange"
                label="Arrange artwork"
                placement="right"
                closeLabel="Close Arrange"
                onClose={onClose}
                className="pointer-events-auto w-[340px] max-w-full max-h-full"
            >
                <section className="space-y-3 bg-white p-3 text-xs dark:bg-dark">
                    <label className="block">
                        Action
                        <select
                            aria-label="Arrangement action"
                            className="mt-1 w-full rounded border bg-transparent p-2"
                            value={action}
                            onChange={(e) => {
                                setResult(null);
                                setAction(e.target.value as LayoutAction);
                            }}
                        >
                            {Object.entries(LAYOUT_ACTIONS).map(
                                ([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>
                    <p>
                        {action.startsWith('space') ||
                        action.startsWith('centres')
                            ? 'Keeps the two end shapes or groups in place.'
                            : 'Anchors the last selected shape or group.'}
                    </p>
                    <div aria-live="polite">
                        {error ? (
                            <p role="alert">{error}</p>
                        ) : result ? (
                            <p>
                                {result.movedUnits} of {result.units} shapes or
                                groups will move
                            </p>
                        ) : (
                            'Arranging…'
                        )}
                    </div>
                    {affected > 0 && (
                        <p className="text-amber-700 dark:text-amber-300">
                            {affected} related toolpaths will be removed.
                            Regenerate them after editing.
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className="rounded border px-3 py-2"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                            disabled={!result?.changedIds.length}
                            onClick={() => {
                                if (result)
                                    try {
                                        onApply(result);
                                    } catch (e) {
                                        setError((e as Error).message);
                                        setResult(null);
                                    }
                            }}
                        >
                            Apply arrangement
                        </button>
                    </div>
                </section>
            </FloatingPanel>
        </div>,
        document.body,
    );
}
