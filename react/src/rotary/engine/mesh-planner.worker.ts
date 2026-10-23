import { planRotaryJob, planRotaryEntry, toolpathSettingsKey } from './job';
import type { MeshPlanRequest } from '../useMeshPlan';
self.onmessage = (event: MessageEvent<MeshPlanRequest>) => {
    const p = event.data;
    let lastProgress = -1;
    const report = (fraction: number) => {
        const progress = Math.max(0, Math.min(99, Math.floor(fraction * 100)));
        if (progress > lastProgress) {
            self.postMessage({ progress });
            lastProgress = progress;
        }
    };
    const jobShare = p.entries.length / (p.entries.length + 1);
    report(0);
    const job = planRotaryJob(
        p.entries,
        p.samples,
        p.stock,
        'stl',
        p.pommels,
        p.mesh,
        (fraction) => report(fraction * jobShare),
    );
    const draftSettings = toolpathSettingsKey(p.draft);
    const existing = job.paths.find(
        ({ entry }) => toolpathSettingsKey(entry) === draftSettings,
    );
    const draft = existing
        ? { ...existing, entry: p.draft }
        : planRotaryEntry(
              p.draft,
              p.samples,
              p.stock,
              'stl',
              p.pommels,
              p.mesh,
              (fraction) => report(jobShare + fraction * (1 - jobShare)),
          );
    report(1);
    self.postMessage({ job, draft });
};
