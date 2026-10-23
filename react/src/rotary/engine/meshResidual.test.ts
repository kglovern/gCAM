import { meshResidual } from './meshResidual';
import type { StlMesh, RotaryTool } from './types';

const mesh: StlMesh = {
    key: 'plane',
    name: 'plane',
    triangles: 1,
    positions: new Float32Array([0, 8, -1, 4, 8, -1, 2, 8, 1]),
};
const tool: RotaryTool = {
    slotNum: 1,
    type: 'ball',
    dia: 2,
    feed: 500,
    plunge: 100,
    spindle: 16000,
};

test('indexed spatial filtering still detects a cutter embedded in a surface', () => {
    const result = meshResidual(
        mesh,
        [{ x: 2, y: 0, z: 7, a: 0, op: 'finish' }],
        tool,
        0.25,
    );
    expect(result.minClearance).toBeLessThan(-0.5);
});

test('probes under an overhang remain unfinished rather than causing a gouge', () => {
    const result = meshResidual(
        mesh,
        [{ x: 2, y: 0, z: 10, a: 0, op: 'finish' }],
        tool,
        0.25,
    );
    expect(result.minClearance).toBeGreaterThanOrEqual(0);
    expect(result.unresolved).toBe(result.samples);
});
