import type { WorkerSegmentsData } from '@sienci/gviewer';

/** Read-only views over the renderer's existing buffers; no per-line position copy. */
export function createPreviewCursor(data: WorkerSegmentsData) {
    const prefix = new Uint32Array(data.prefixEndVertex);
    let count = 0;
    const chunks = data.chunks.map((chunk) => {
        const start = count;
        count += chunk.vertexCount;
        if (
            chunk.vertexCount < 0 ||
            chunk.positions.byteLength < chunk.vertexCount * 12
        )
            throw new Error('Invalid preview position buffer.');
        return {
            start,
            end: count,
            positions: new Float32Array(chunk.positions),
        };
    });
    if (count !== data.totalVertices)
        throw new Error('Invalid preview vertex count.');
    return {
        lines: prefix.length,
        vertices: count,
        position(completed: number) {
            if (!Number.isFinite(completed) || completed < 1 || !prefix.length)
                return null;
            const vertex =
                prefix[Math.min(prefix.length, Math.floor(completed)) - 1] - 1;
            if (vertex < 0 || vertex >= count) return null;
            for (const chunk of chunks) {
                if (vertex >= chunk.end) continue;
                const i = (vertex - chunk.start) * 3;
                const x = chunk.positions[i],
                    y = chunk.positions[i + 1],
                    z = chunk.positions[i + 2];
                return Number.isFinite(x) &&
                    Number.isFinite(y) &&
                    Number.isFinite(z)
                    ? { x, y, z }
                    : null;
            }
            return null;
        },
    };
}
