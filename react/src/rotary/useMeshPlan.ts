import { createMeshWorker } from './meshWorker';
import { useEffect, useState } from 'react';
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
        error?: string;
    } | null>(null);
    useEffect(() => {
        if (!request) return;
        let worker: Worker | undefined;
        let deadline: number | undefined;
        let active = true;
        const timer = window.setTimeout(() => {
            try {
                worker = createMeshWorker();
                worker.onmessage = (event: MessageEvent<MeshPlanResult>) => {
                    if (!active) return;
                    window.clearTimeout(deadline);
                    worker?.terminate();
                    setState({ request, result: event.data });
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
    }, [request]);
    return state?.request === request ? state : null;
}
