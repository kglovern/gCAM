import { normalizePreviewArcs } from './normalize-preview-arcs';
import { prepareGcodePreview } from './prepare-gcode-preview';

function positions(data: Awaited<ReturnType<typeof prepareGcodePreview>>) {
    return data.chunks.flatMap((chunk) => [
        ...new Float32Array(chunk.positions),
    ]);
}
test.each([
    ['G17', 'X10 Y0', 'I-10 J0', 0, 1],
    ['G18', 'Z10 X0', 'K-10 I0', 2, 0],
    ['G19', 'Y10 Z0', 'J-10 K0', 1, 2],
])(
    'full circles in %s preserve radius, direction, power and original source lines',
    async (plane, start, centre, u, v) => {
        for (const direction of ['G2', 'G3']) {
            const code = [
                'G21 G90 ' + plane,
                'M4 S0',
                'G0 ' + start,
                'M4 S500',
                direction + ' ' + centre + ' F600',
                '; afterwards',
            ].join('\n');
            const data = await prepareGcodePreview(code, () => {}, {
                laser: true,
            });
            const prefix = new Uint32Array(data.prefixEndVertex),
                points = positions(data);
            expect(prefix).toHaveLength(6);
            expect(prefix[3]).toBe(2);
            expect(prefix[4] - prefix[3]).toBe(120);
            expect(prefix[5]).toBe(prefix[4]);
            for (let vertex = 2; vertex < data.totalVertices; vertex++)
                expect(
                    Math.hypot(
                        points[vertex * 3 + Number(u)],
                        points[vertex * 3 + Number(v)],
                    ),
                ).toBeCloseTo(10, 4);
            const firstEnd = points[3 * 3 + Number(v)];
            expect(Math.sign(firstEnd)).toBe(direction === 'G3' ? 1 : -1);
            expect(
                data.chunks
                    .flatMap((chunk) => [...new Float32Array(chunk.power!)])
                    .slice(2),
            ).toEqual(Array(120).fill(500));
        }
    },
);
test('relative inches and modal full-circle repeats return to the original point', async () => {
    const code = 'G20 G91\nG0 X1\nM4 S500\nG2 I-1 F60\nI-1\nG1 X1';
    const data = await prepareGcodePreview(code, () => {}, { laser: true });
    const points = positions(data),
        prefix = new Uint32Array(data.prefixEndVertex);
    expect(prefix[3] - prefix[2]).toBe(120);
    expect(prefix[4] - prefix[3]).toBe(120);
    expect(points[points.length - 3]).toBeCloseTo(50.8, 4);
    expect(points[(prefix[4] - 1) * 3]).toBeCloseTo(25.4, 4);
});
test('G91.1 preserves absolute axes and absolute arc centres convert only for preview', async () => {
    const relative = 'G90 G0 X10\nG91.1\nG3 X0 Y10 I-10 J0 F600\nG1 X20';
    const absolute = 'G90 G0 X10\nG90.1\nG3 X0 Y10 I0 J0 F600\nG1 X20';
    const a = positions(await prepareGcodePreview(relative)),
        b = positions(await prepareGcodePreview(absolute));
    expect(a).toEqual(b);
    expect(a[a.length - 3]).toBe(20);
    const full = await prepareGcodePreview(
        'G90 G0 X10\nG90.1 G2 I0 J0 F600\nG1 X20',
    );
    expect(full.totalVertices).toBe(124);
    expect(positions(full).slice(-3)).toEqual([20, 0, 0]);
});
test('linear raster avoids extra modal parsing and normalization allocations', async () => {
    const lines = ['G21', 'G90', 'M4 S0', 'G1 X100 S500 F600', 'X0'];
    const normalized = await normalizePreviewArcs(lines);
    expect(normalized.lines).toBe(lines);
    expect(normalized.sourceEnds).toBeUndefined();
});

test('arc-centre declarations alone do not change axis distance mode or allocate a source map', async () => {
    const lines = ['G90 G0 X10', 'G91.1', 'G1 X20'];
    const normalized = await normalizePreviewArcs(lines);
    expect(normalized.sourceEnds).toBeUndefined();
    expect(lines[1]).toBe('G91.1');
    const points = positions(await prepareGcodePreview(lines.join('\n')));
    expect(points.slice(-3)).toEqual([20, 0, 0]);
});
test('invalid full circles fail before a missing or oversized preview can be displayed', async () => {
    await expect(normalizePreviewArcs(['G2 I0 J0'])).rejects.toThrow('centre');
    await expect(normalizePreviewArcs(['G2 R10'])).rejects.toThrow('offsets');
    const lines = ['G0 X10', ...Array(34000).fill('G2 I-10 F600')];
    await expect(normalizePreviewArcs(lines)).rejects.toThrow('budget');
});

test('multi-turn arcs retain winding, helical progression and original source mapping', async () => {
    const data = await prepareGcodePreview(
        'G0 X10\nG3 X0 Y10 Z5 I-10 P2 F600\nG1 X20',
    );
    const points = positions(data),
        prefix = new Uint32Array(data.prefixEndVertex);
    expect(prefix[1] - prefix[0]).toBe(180);
    let sweep = 0,
        lastZ = 0;
    for (let vertex = prefix[0]; vertex < prefix[1]; vertex += 2) {
        const start = vertex * 3,
            end = (vertex + 1) * 3;
        let delta =
            Math.atan2(points[end + 1], points[end]) -
            Math.atan2(points[start + 1], points[start]);
        if (delta < 0) delta += 2 * Math.PI;
        sweep += delta;
        expect(Math.hypot(points[end], points[end + 1])).toBeCloseTo(10, 4);
        expect(points[end + 2]).toBeGreaterThanOrEqual(lastZ);
        lastZ = points[end + 2];
    }
    expect(sweep).toBeCloseTo(2.5 * Math.PI, 6);
    expect(lastZ).toBe(5);
    expect(points.slice(-3)).toEqual([20, 10, 5]);
    const circle = await prepareGcodePreview('G0 X10\nG2 I-10 P2 F600');
    expect(circle.totalVertices).toBe(242);
    await expect(normalizePreviewArcs(['G2 I-10 P0'])).rejects.toThrow(
        'integer',
    );
});
