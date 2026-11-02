import { jest } from '@jest/globals';
import {
    drawPocketDepths,
    pocketDepthColor,
    pocketPreviewRegion,
} from './pocketDepthPreview';
const rect = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
];
test('accepts only valid pocket regions, without changing coordinates or legacy jobs', () => {
    const contours = [
            rect,
            rect.map((p) => ({ x: 2 + p.x / 2, y: 2 + p.y / 2 })),
        ],
        toolpath = { cutDepth: 3, pocketRegion: contours };
    const region = pocketPreviewRegion('pocket', toolpath);
    expect(region?.contours).toBe(contours);
    expect(region?.depthMm).toBe(3);
    expect(pocketPreviewRegion('pocket', { cutDepth: 3 })).toBeNull();
    expect(pocketPreviewRegion('laser-fill', toolpath)).toBeNull();
    for (const pocketRegion of [[null], [[{ x: NaN, y: 1 }]], ['bad'], []])
        expect(
            pocketPreviewRegion('pocket', { cutDepth: 3, pocketRegion }),
        ).toBeNull();
    expect(
        pocketPreviewRegion('pocket', { ...toolpath, cutDepth: Infinity }),
    ).toBeNull();
});
test('both themes get progressively darker with depth', () => {
    for (const dark of [false, true]) {
        const colors = [1, 3, 8, 30].map((d) =>
            pocketDepthColor(d, dark)
                .match(/\d+/g)!
                .map(Number)
                .reduce((a, b) => a + b),
        );
        expect(colors[0]).toBeGreaterThan(colors[1]);
        expect(colors[1]).toBeGreaterThan(colors[2]);
        expect(colors[2]).toBeGreaterThan(colors[3]);
    }
});
test('clips compound regions with even-odd islands, paints deepest last, and caches world paths across camera changes', () => {
    const previous = globalThis.Path2D;
    class MockPath {
        moveTo = jest.fn();
        lineTo = jest.fn();
        closePath = jest.fn();
    }
    globalThis.Path2D = MockPath as unknown as typeof Path2D;
    try {
        const fills: unknown[][] = [];
        const ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            translate: jest.fn(),
            scale: jest.fn(),
            clip: jest.fn(),
            stroke: jest.fn(),
            fillStyle: '',
            fill(path: unknown, rule: unknown) {
                fills.push([path, rule, this.fillStyle]);
            },
        };
        const shallow = { contours: [rect, rect], depthMm: 2 },
            deep = { contours: [rect], depthMm: 8 };
        drawPocketDepths(
            ctx as unknown as CanvasRenderingContext2D,
            [{ pocket: deep }, { pocket: shallow }],
            { scale: 2, tx: 10, ty: 40 },
            false,
        );
        expect(fills.map((f) => f[2])).toEqual([
            pocketDepthColor(2, false),
            pocketDepthColor(8, false),
        ]);
        expect(ctx.clip.mock.calls.map((c) => c[1])).toEqual([
            'evenodd',
            'evenodd',
        ]);
        expect((fills[0][0] as MockPath).closePath).toHaveBeenCalledTimes(2);
        drawPocketDepths(
            ctx as unknown as CanvasRenderingContext2D,
            [{ pocket: shallow }],
            { scale: 3, tx: 0, ty: 0 },
            true,
        );
        expect(fills[2][0]).toBe(fills[0][0]);
        expect(ctx.scale).toHaveBeenLastCalledWith(3, -3);
        expect(ctx.restore).toHaveBeenCalledTimes(3);
    } finally {
        globalThis.Path2D = previous;
    }
});
