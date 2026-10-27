import { useMemo } from 'react';
import { planRotaryJob, planRotaryEntry } from '../engine/job';
import type { MeshPlanRequest } from '../useMeshPlan';
export function useSynchronousPlan(request: MeshPlanRequest | null) {
    return useMemo(
        () =>
            request
                ? {
                      request,
                      result: {
                          job: planRotaryJob(
                              request.entries,
                              request.samples,
                              request.stock,
                              request.mode ?? 'stl',
                              request.pommels,
                              request.mesh,
                          ),
                          draft: planRotaryEntry(
                              request.draft,
                              request.samples,
                              request.stock,
                              request.mode ?? 'stl',
                              request.pommels,
                              request.mesh,
                          ),
                      },
                  }
                : null,
        [request],
    );
}
