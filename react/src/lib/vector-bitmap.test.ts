import {
    vectorBitmapPlan,
    prepareVectorBitmap,
    type VectorBitmapRequest,
} from './vector-bitmap';
import { polygonArea } from '../geometry/bounds.js';
const rect = (id: string, x: number, y: number, w: number, h: number) => ({
    id,
    points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
    ].map(([x, y]) => ({ x, y })),
});
const request: VectorBitmapRequest = {
    shapes: [rect('outer', 10, 20, 25.4, 12.7)],
    fillIds: [],
    render: 'fill',
    dpi: 100,
    lineWidth: 0.2,
};
test('DPI retains physical bounds and outlines include their stroke padding', () => {
    const fill = vectorBitmapPlan(request);
    expect(fill.widthPx).toBe(100);
    expect(fill.heightPx).toBe(50);
    expect(fill.bounds).toEqual({ minX: 10, minY: 20, maxX: 35.4, maxY: 32.7 });
    const stroke = vectorBitmapPlan({
        ...request,
        render: 'outline',
        lineWidth: 2,
    });
    expect(stroke.widthMm).toBeCloseTo(27.4);
    expect(stroke.heightMm).toBeCloseTo(14.7);
    expect(stroke.bounds.minX).toBe(9);
});
test('fill unions overlaps and preserves nested holes without mutating artwork', () => {
    const shapes = [
        rect('outer', 0, 0, 20, 20),
        rect('hole', 5, 5, 5, 5),
        rect('overlap', 15, 10, 10, 10),
    ];
    const before = JSON.stringify(shapes);
    const plan = prepareVectorBitmap({ ...request, shapes });
    expect(plan.fills.reduce((sum, p) => sum + polygonArea(p), 0)).toBeCloseTo(
        425,
    );
    expect(JSON.stringify(shapes)).toBe(before);
});
test('operation rendering fills only the explicit fill targets and retains open outlines', () => {
    const open = {
        id: 'open',
        points: [
            { x: 0, y: 0 },
            { x: 5, y: 3 },
        ],
    };
    const plan = prepareVectorBitmap({
        ...request,
        shapes: [...request.shapes, open],
        render: 'operations',
        fillIds: ['outer'],
    });
    expect(plan.fills).toHaveLength(1);
    expect(plan.outlines).toEqual([open.points]);
    expect(() => prepareVectorBitmap({ ...request, shapes: [open] })).toThrow(
        'closed',
    );
});
test.each([
    { dpi: 0 },
    { dpi: 2500 },
    { lineWidth: 0 },
    { lineWidth: NaN },
    { shapes: [] },
    { shapes: [rect('huge', 0, 0, 10000, 10000)] },
    {
        shapes: [
            {
                id: 'bad',
                points: [
                    { x: NaN, y: 0 },
                    { x: 1, y: 1 },
                ],
            },
        ],
    },
])(
    'invalid or oversized requests fail without silent downscaling: %p',
    (patch) => {
        expect(() => vectorBitmapPlan({ ...request, ...patch })).toThrow();
    },
);
