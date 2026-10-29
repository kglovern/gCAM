/**
 * Tests: fillet rounds square corners inside the original bounds; fillet leaves impossible radii sharp; chamfer replaces each square corner with a straight cut; dogbone emits one tool circle per corner.
 */
import {
    chamferCorner,
    chamferLoop,
    dogboneLoops,
    dogboneReliefCorner,
    filletLoop,
} from './corners';
import { boundsOfPoints } from '../engine/paths.js';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];

test('fillet rounds square corners inside the original bounds', () => {
    const out = filletLoop(SQUARE, 3);
    expect(out.length).toBeGreaterThan(5);
    // closed loop preserved
    expect(out[0]).toEqual(out[out.length - 1]);
    const b = boundsOfPoints(out);
    expect(b.minX).toBeCloseTo(0, 0);
    expect(b.maxX).toBeCloseTo(20, 0);
    // corner point itself is gone, replaced by arc endpoints
    expect(out.some((p) => p.x === 0 && p.y === 0)).toBe(false);
});

test('fillet leaves impossible radii sharp', () => {
    const out = filletLoop(SQUARE, 500);
    expect(out).toEqual(SQUARE);
});

test('chamfer replaces each square corner with a straight cut', () => {
    const out = chamferLoop(SQUARE, 3);
    expect(out).toHaveLength(9);
    expect(out[0]).toEqual(out[out.length - 1]);
    expect(out.some((p) => p.x === 0 && p.y === 0)).toBe(false);
    expect(boundsOfPoints(out)).toEqual(boundsOfPoints(SQUARE));
});

test('dogbone emits one tool circle per corner', () => {
    const circles = dogboneLoops(SQUARE, 3);
    expect(circles).toHaveLength(4);
    for (const c of circles) {
        const b = boundsOfPoints(c);
        expect(b.maxX - b.minX).toBeCloseTo(6, 0);
    }
});

test('chamfer changes only the picked corner and preserves closure', () => {
    const out = chamferCorner(SQUARE, 1, 3)!;
    expect(out).toEqual([
        { x: 0, y: 0 },
        { x: 17, y: 0 },
        { x: 20, y: 3 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
        { x: 0, y: 0 },
    ]);
    expect(chamferCorner(SQUARE, 1, 25)).toBeNull();
});

test('dogbone becomes one closed outline with shortened edges and the original relief location', () => {
    const result = dogboneReliefCorner(SQUARE, 2, 3)!;
    expect(result[0]).toEqual(result[result.length - 1]);
    expect(result).toContainEqual({ x: 0, y: 0 });
    expect(result).toContainEqual({ x: 20, y: 0 });
    expect(result).toContainEqual({ x: 0, y: 20 });
    expect(boundsOfPoints(result).maxX).toBeGreaterThan(20);
    expect(boundsOfPoints(result).maxY).toBeGreaterThan(20);
    // Neither old straight edge may continue through the relief arc.
    for (let i = 1; i < result.length; i++) {
        const a = result[i - 1],
            b = result[i];
        expect(a.x === 20 && b.x === 20 && Math.max(a.y, b.y) > 18).toBe(false);
        expect(a.y === 20 && b.y === 20 && Math.max(a.x, b.x) > 18).toBe(false);
    }
    expect(SQUARE).toHaveLength(5);
});
test('dogbone cleanup supports reversed outlines and open corner chains', () => {
    const reversed = dogboneReliefCorner([...SQUARE].reverse(), 2, 3)!;
    expect(boundsOfPoints(reversed).maxX).toBeGreaterThan(20);
    const open = [
        { x: 0, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 0 },
    ];
    const result = dogboneReliefCorner(open, 1, 3)!;
    expect(result[0]).toEqual(open[0]);
    expect(result[result.length - 1]).toEqual(open[2]);
    expect(result.length).toBeGreaterThan(3);
    expect(dogboneReliefCorner(open, 0, 3)).toBeNull();
});

test('repeated dogbones work on sampled SVG edges and duplicate closure points', () => {
    const sampled = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
        { x: 0, y: 20 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ];
    const first = dogboneReliefCorner(sampled, 4, 3)!;
    expect(first).not.toBeNull();
    expect(boundsOfPoints(first).maxX).toBeGreaterThan(20.8);
    const second = dogboneReliefCorner(
        first,
        first.findIndex((p) => p.x === 0 && p.y === 0),
        3,
    )!;
    expect(second).not.toBeNull();
    expect(boundsOfPoints(second).minX).toBeLessThan(-0.8);
    expect(second[0]).toEqual(second[second.length - 1]);
});
