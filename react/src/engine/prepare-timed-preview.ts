import { GCodeParser, SEGMENT_ATTR_RAPID } from '@sienci/gviewer';
import type { WorkerSegmentsData, WorkerSegmentsChunk } from '@sienci/gviewer';
import type { TimedPreviewPlan } from '../gcode/estimateTime';

export interface TimedPreview {
    plan: TimedPreviewPlan;
    geometry: WorkerSegmentsData;
}

/** Pack the same planned chords used by the clock, preserving original source-line progress. */
export async function prepareTimedPreview(
    gcode: string,
    plan: TimedPreviewPlan,
    configuredMax?: number,
    progress: (percent: number) => void = () => {},
): Promise<TimedPreview> {
    const lines = gcode.split(/\r?\n/);
    if (lines.length !== plan.lineCount)
        throw new Error('Timed preview source lines do not match.');
    const get = (block: number, field: number) =>
        plan.chunks[Math.floor(block / plan.chunkSize)].values[
            (block % plan.chunkSize) * 8 + field
        ];
    const sourceLine = (block: number) =>
        plan.chunks[Math.floor(block / plan.chunkSize)].lines[
            block % plan.chunkSize
        ];
    let totalVertices = 0;
    for (let block = 0; block < plan.blockCount; block++)
        if (get(block, 4) > 0) totalVertices += 2;
    const chunks: WorkerSegmentsChunk[] = [];
    let positions = new Float32Array(0),
        attrs = new Uint8Array(0),
        powers = new Float32Array(0);
    let block = 0,
        written = 0,
        used = 0,
        power = 0,
        spindle = false,
        rapid = true;
    let previous = [...plan.start];
    const prefix = new Uint32Array(lines.length),
        parser = new GCodeParser();
    for (let line = 0; line < lines.length; line++) {
        const words = parser.parseLine(lines[line]).words;
        const dwell = words.some(
            (word) => word.letter === 'G' && word.value === 4,
        );
        for (const word of words) {
            if (word.letter === 'G' && [0, 1, 2, 3].includes(word.value))
                rapid = word.value === 0;
            if (word.letter === 'S' && !dwell) power = word.value;
            if (word.letter === 'M' && [3, 4].includes(word.value))
                spindle = true;
            if (word.letter === 'M' && word.value === 5) spindle = false;
        }
        while (block < plan.blockCount && sourceLine(block) === line) {
            const end = [get(block, 1), get(block, 2), get(block, 3)];
            if (get(block, 4) > 0) {
                if (used === attrs.length) {
                    const size = Math.min(131072, totalVertices - written);
                    positions = new Float32Array(size * 3);
                    attrs = new Uint8Array(size);
                    powers = new Float32Array(size);
                    chunks.push({
                        positions: positions.buffer,
                        attrs: attrs.buffer,
                        power: powers.buffer,
                        vertexCount: size,
                    });
                    used = 0;
                }
                positions.set(previous, used * 3);
                positions.set(end, (used + 1) * 3);
                attrs.fill(rapid ? SEGMENT_ATTR_RAPID : 0, used, used + 2);
                powers.fill(rapid || !spindle ? 0 : power, used, used + 2);
                written += 2;
                used += 2;
            }
            previous = end;
            block++;
        }
        prefix[line] = written;
        if ((line & 4095) === 0) {
            progress(Math.floor((100 * line) / lines.length));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    if (block !== plan.blockCount || written !== totalVertices)
        throw new Error(
            'Timed preview motion does not match its source lines.',
        );
    return {
        plan,
        geometry: {
            format: 'segments-v1',
            isLaser: true,
            chunks,
            totalVertices,
            prefixEndVertex: prefix.buffer,
            maxPower: Math.max(
                Number.EPSILON,
                configuredMax ||
                    Number(gcode.match(/\(Laser power max S([\d.]+)\)/)?.[1]) ||
                    1000,
            ),
        },
    };
}
