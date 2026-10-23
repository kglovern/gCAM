import { createMeshWorker } from './meshWorker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { combineRotaryPaths, toolpathSettingsKey } from './engine/job';
import type { planRotaryEntry, planRotaryJob } from './engine/job';
import type {
    RotaryToolpathEntry,
    ProfileSample,
    RotaryStock,
    PommelZone,
    StlMesh,
} from './engine/types';

export interface MeshPlanRequest {
    entries: RotaryToolpathEntry[];
    draft: RotaryToolpathEntry;
    samples: ProfileSample[];
    stock: RotaryStock;
    pommels: PommelZone[];
    mesh: StlMesh | null;
}
interface MeshPlanResult {
    job: ReturnType<typeof planRotaryJob>;
    draft: ReturnType<typeof planRotaryEntry>;
}
/** Termination cancels CPU work; identity gating makes stale results unexportable. */
export function useMeshPlan(request: MeshPlanRequest | null) {
    const [state, setState] = useState<{
        request: MeshPlanRequest;
        result?: MeshPlanResult;
        progress?: number;
        error?: string;
    } | null>(null);
    const completed = useRef<{
        request: MeshPlanRequest;
        result: MeshPlanResult;
    } | null>(null);
    const reused = useMemo<typeof state>(() => {
        const cached = completed.current;
        if (
            !request ||
            !cached ||
            request.mesh !== cached.request.mesh ||
            request.stock !== cached.request.stock ||
            request.pommels !== cached.request.pommels ||
            request.samples !== cached.request.samples
        )
            return null;
        const available = new Map(
            [...cached.result.job.paths, cached.result.draft].map((path) => [
                toolpathSettingsKey(path.entry),
                path,
            ]),
        );
        const reuse = (entry: RotaryToolpathEntry) => {
            const path = available.get(toolpathSettingsKey(entry));
            return path ? { ...path, entry } : undefined;
        };
        const paths: MeshPlanResult['job']['paths'] = [];
        for (const entry of request.entries) {
            const path = reuse(entry);
            if (!path) return null;
            paths.push(path);
        }
        const draft = reuse(request.draft);
        if (!draft) return null;
        return {
            request,
            result: {
                job: combineRotaryPaths(paths),
                draft,
            },
        };
    }, [request]);
    useEffect(() => {
        if (!request || reused) return;
        let worker: Worker | undefined;
        let deadline: number | undefined;
        let active = true;
        const timer = window.setTimeout(() => {
            try {
                worker = createMeshWorker();
                worker.onmessage = (
                    event: MessageEvent<MeshPlanResult | { progress: number }>,
                ) => {
                    if (!active) return;
                    if ('progress' in event.data) {
                        setState({ request, progress: event.data.progress });
                        return;
                    }
                    window.clearTimeout(deadline);
                    worker?.terminate();
                    completed.current = { request, result: event.data };
                    setState(completed.current);
                    active = false;
                };
                worker.onerror = () => {
                    if (!active) return;
                    window.clearTimeout(deadline);
                    worker?.terminate();
                    setState({
                        request,
                        error: 'Mesh planning worker failed. Increase cell size or simplify the mesh.',
                    });
                    active = false;
                };
                deadline = window.setTimeout(() => {
                    worker?.terminate();
                    if (active)
                        setState({
                            request,
                            error: 'Mesh planning exceeded 90 seconds. Increase cell size or simplify the mesh.',
                        });
                    active = false;
                }, 90000);
                worker.postMessage(request);
            } catch (error) {
                setState({
                    request,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Mesh planning unavailable.',
                });
            }
        }, 400);
        return () => {
            active = false;
            window.clearTimeout(deadline);
            window.clearTimeout(timer);
            worker?.terminate();
        };
    }, [request, reused]);
    return reused ?? (state?.request === request ? state : null);
}
