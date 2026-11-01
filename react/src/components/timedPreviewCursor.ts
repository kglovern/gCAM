import type { TimedPreviewPlan } from '../gcode/estimateTime';

/** Samples the worker's planned ramps/chords without scanning or copying its motion buffers. */
export function createTimedPreviewCursor(plan: TimedPreviewPlan) {
    if (
        plan.format !== 'timing-v1' ||
        !Number.isSafeInteger(plan.chunkSize) ||
        plan.chunkSize < 1 ||
        !Number.isSafeInteger(plan.blockCount) ||
        plan.blockCount < 0 ||
        !Number.isFinite(plan.seconds) ||
        plan.seconds < 0 ||
        plan.chunks.length !== Math.ceil(plan.blockCount / plan.chunkSize)
    )
        throw new Error('Invalid timed preview metadata.');
    for (const [index, chunk] of plan.chunks.entries()) {
        const used = Math.min(
            plan.chunkSize,
            plan.blockCount - index * plan.chunkSize,
        );
        if (chunk.lines.length !== used || chunk.values.length !== used * 8)
            throw new Error('Invalid timed preview buffers.');
    }
    const get = (block: number, field: number) =>
        plan.chunks[Math.floor(block / plan.chunkSize)].values[
            (block % plan.chunkSize) * 8 + field
        ];
    const endpoint = (block: number) =>
        block < 0 ? plan.start : [get(block, 1), get(block, 2), get(block, 3)];
    return {
        seconds: plan.seconds,
        lines: plan.lineCount,
        sample(value: number) {
            if (!Number.isFinite(value)) return null;
            const time = Math.max(0, Math.min(plan.seconds, value));
            let low = 0,
                high = plan.blockCount;
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (get(middle, 0) <= time) low = middle + 1;
                else high = middle;
            }
            if (low === plan.blockCount) {
                const [x, y, z] = endpoint(low - 1);
                return {
                    position: { x, y, z },
                    completedLines: plan.lineCount,
                };
            }
            const startTime = low ? get(low - 1, 0) : 0;
            const duration = get(low, 0) - startTime;
            const elapsed = time - startTime,
                length = get(low, 4);
            let fraction = 0;
            if (length > 0) {
                const acceleration = get(low, 5),
                    entry = get(low, 6),
                    peak = get(low, 7);
                const exit = low + 1 < plan.blockCount ? get(low + 1, 6) : 0;
                const accelerating = (peak - entry) / acceleration;
                const braking = (peak - exit) / acceleration;
                let distance: number;
                if (elapsed <= accelerating)
                    distance =
                        entry * elapsed +
                        (acceleration * elapsed * elapsed) / 2;
                else if (elapsed < duration - braking)
                    distance =
                        (peak * peak - entry * entry) / (2 * acceleration) +
                        peak * (elapsed - accelerating);
                else {
                    const remaining = duration - elapsed;
                    distance =
                        length -
                        exit * remaining -
                        (acceleration * remaining * remaining) / 2;
                }
                fraction = Math.max(0, Math.min(1, distance / length));
            }
            const start = endpoint(low - 1),
                end = endpoint(low);
            return {
                position: {
                    x: start[0] + (end[0] - start[0]) * fraction,
                    y: start[1] + (end[1] - start[1]) * fraction,
                    z: start[2] + (end[2] - start[2]) * fraction,
                },
                completedLines:
                    plan.chunks[Math.floor(low / plan.chunkSize)].lines[
                        low % plan.chunkSize
                    ],
            };
        },
    };
}
