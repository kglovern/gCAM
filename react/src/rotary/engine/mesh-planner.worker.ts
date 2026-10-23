import { planRotaryJob, planRotaryEntry } from './job';
import type { MeshPlanRequest } from '../useMeshPlan';
self.onmessage = (event: MessageEvent<MeshPlanRequest>) => {
    const p = event.data;
    const job = planRotaryJob(
        p.entries,
        p.samples,
        p.stock,
        'stl',
        p.pommels,
        p.mesh,
    );
    const draft = planRotaryEntry(
        p.draft,
        p.samples,
        p.stock,
        'stl',
        p.pommels,
        p.mesh,
    );
    self.postMessage({ job, draft });
};
