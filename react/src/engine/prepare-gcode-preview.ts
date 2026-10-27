import {
    buildToolpathGeometryFromLinesBatched,
    SEGMENT_ATTR_RAPID,
} from '@sienci/gviewer';
import type { WorkerSegmentsChunk, WorkerSegmentsData } from '@sienci/gviewer';

/** Parse and pack into the viewer's final GPU layout, entirely in the worker. */
export async function prepareGcodePreview(
    gcode: string,
    onProgress: (percent: number) => void = () => {},
): Promise<WorkerSegmentsData> {
    const lines = gcode.split(/\r?\n/);
    const geometry = await buildToolpathGeometryFromLinesBatched(lines, {
        arcSegments: 30,
        batch: {
            everyLines: 4096,
            yieldEveryLines: 4096,
            onProgress: (done, total) =>
                onProgress(Math.floor((80 * done) / total)),
        },
    });
    const streams = [geometry.rapid, ...geometry.cuts];
    const totalVertices = streams.reduce(
        (sum, s) => sum + s.positions.length / 3,
        0,
    );
    const prefix = new Uint32Array(lines.length);
    const cursors = streams.map(() => 0);
    const chunks: WorkerSegmentsChunk[] = [];
    let written = 0,
        chunkUsed = 0;
    let positions = new Float32Array(0),
        attrs = new Uint8Array(0);
    for (let line = 0; line < lines.length; line++) {
        for (let stream = 0; stream < streams.length; stream++) {
            const source = streams[stream];
            const end = source.prefixEndVertex[line];
            while (cursors[stream] < end) {
                if (chunkUsed === attrs.length) {
                    const size = Math.min(131072, totalVertices - written);
                    positions = new Float32Array(size * 3);
                    attrs = new Uint8Array(size);
                    chunks.push({
                        positions: positions.buffer,
                        attrs: attrs.buffer,
                        vertexCount: size,
                    });
                    chunkUsed = 0;
                }
                const count = Math.min(
                    end - cursors[stream],
                    attrs.length - chunkUsed,
                );
                positions.set(
                    source.positions.subarray(
                        cursors[stream] * 3,
                        (cursors[stream] + count) * 3,
                    ),
                    chunkUsed * 3,
                );
                attrs.fill(
                    stream === 0 ? SEGMENT_ATTR_RAPID : 0,
                    chunkUsed,
                    chunkUsed + count,
                );
                cursors[stream] += count;
                chunkUsed += count;
                written += count;
            }
        }
        prefix[line] = written;
        if ((line & 4095) === 0)
            onProgress(80 + Math.floor((20 * line) / lines.length));
    }
    return {
        format: 'segments-v1',
        chunks,
        totalVertices,
        prefixEndVertex: prefix.buffer,
    };
}
