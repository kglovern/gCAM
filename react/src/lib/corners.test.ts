/**
 * Tests: fillet rounds square corners inside the original bounds; fillet leaves impossible radii sharp; chamfer replaces each square corner with a straight cut; dogbone emits one tool circle per corner.
 */
import {
    chamferCorner,
    chamferLoop,
    dogboneLoops,
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
