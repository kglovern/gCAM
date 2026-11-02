import {
    applyArtworkPattern,
    patternArtwork,
    type PatternSettings,
} from './pattern-artwork';
import type { ViewLoop } from '../canvas/types';
const shape: ViewLoop = {
    id: 'outer',
    groupId: 'letter',
    layerId: 'wood',
    text: 'D',
    points: [
        { x: 10, y: 2 },
        { x: 14, y: 2 },
        { x: 14, y: 8 },
        { x: 10, y: 2 },
    ],
};
const hole: ViewLoop = {
    id: 'hole',
    groupId: 'letter',
    points: [
        { x: 11, y: 3 },
        { x: 12, y: 3 },
        { x: 11, y: 4 },
        { x: 11, y: 3 },
    ],
};
const mirror = (extra = {}): PatternSettings => ({
    kind: 'mirror',
    axis: 'vertical',
    position: 20,
    keepOriginal: false,
    ...extra,
});
test.each(['vertical', 'horizontal'] as const)(
    'reflects exact geometry and circle metadata across %s without editing sources',
    (axis) => {
        const circle = {
            ...shape,
            exportGeometry: { type: 'circle', cx: 12, cy: 5, r: 2 },
        };
        const before = JSON.stringify(circle);
        const result = patternArtwork([circle], mirror({ axis }));
        const reflected = result.instances[0][0];
        expect(reflected.points[0]).toEqual(
            axis === 'vertical' ? { x: 30, y: 2 } : { x: 10, y: 38 },
        );
        expect(reflected.exportGeometry).toEqual(
            axis === 'vertical'
                ? { type: 'circle', cx: 28, cy: 5, r: 2 }
                : { type: 'circle', cx: 12, cy: 35, r: 2 },
        );
        expect(reflected.points[reflected.points.length - 1]).toEqual(
            reflected.points[0],
        );
        expect(reflected.layerId).toBe('wood');
        expect(JSON.stringify(circle)).toBe(before);
        expect(
            patternArtwork([reflected], mirror({ axis })).instances[0][0]
                .points,
        ).toEqual(circle.points);
    },
);
test('rectangular counts include original, gaps use whole-selection bounds, and holes get distinct copy groups', () => {
    const source = [shape, hole],
        result = patternArtwork(source, {
            kind: 'rectangular',
            columns: 3,
            rows: 2,
            gapX: 5,
            gapY: 7,
        });
    expect(result.instances).toHaveLength(5);
    expect(result.instances[0][0].points[0]).toEqual({ x: 19, y: 2 });
    expect(result.instances[2][0].points[0]).toEqual({ x: 10, y: 15 });
    let id = 0;
    const committed = applyArtworkPattern(
        source,
        source,
        result,
        () => `new-${++id}`,
    );
    expect(committed.loops).toHaveLength(12);
    expect(committed.loops.slice(0, 2)).toEqual(source);
    const groups = committed.loops.slice(2).map((s) => s.groupId);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[0]).not.toBe(groups[2]);
    expect(groups).not.toContain('letter');
    expect(new Set(committed.loops.map((s) => s.id)).size).toBe(12);
    expect(committed.changedSources).toEqual([]);
});
test('circular full rings omit duplicate endpoint; partial sweeps include it and preserve orientation when requested', () => {
    const settings: PatternSettings = {
        kind: 'circular',
        count: 4,
        centerX: 0,
        centerY: 0,
        sweep: 360,
        rotateCopies: true,
    };
    const result = patternArtwork([shape], settings);
    expect(result.instances).toHaveLength(3);
    expect(result.instances[0][0].points[0].x).toBeCloseTo(-2);
    expect(result.instances[0][0].points[0].y).toBeCloseTo(10);
    const partial = patternArtwork([shape], {
        ...settings,
        count: 3,
        sweep: -180,
    });
    expect(partial.instances[1][0].points[0].x).toBeCloseTo(-10);
    expect(partial.instances[1][0].points[0].y).toBeCloseTo(-2);
    const upright = patternArtwork([shape], {
        ...settings,
        rotateCopies: false,
    }).instances[0][0].points;
    expect(upright[1].x - upright[0].x).toBeCloseTo(4);
    expect(upright[1].y - upright[0].y).toBeCloseTo(0);
});
test('in-place mirrors retain ids and isolate affected sources; copies leave originals intact', () => {
    let id = 0;
    const untouched = { ...shape, id: 'other', groupId: undefined };
    const source = [shape, hole];
    const result = applyArtworkPattern(
        [...source, untouched],
        source,
        patternArtwork(source, mirror()),
        () => `${++id}`,
    );
    expect(result.loops.map((s) => s.id)).toEqual(['outer', 'hole', 'other']);
    expect(result.changedSources).toEqual(source);
    expect(result.loops[2]).toBe(untouched);
    expect(
        applyArtworkPattern(
            source,
            source,
            patternArtwork(source, mirror({ keepOriginal: true })),
            () => `${++id}`,
        ).loops.slice(0, 2),
    ).toEqual(source);
});
test('rejects stale source geometry and changed group membership before committing', () => {
    const result = patternArtwork([shape], mirror());
    expect(() =>
        applyArtworkPattern(
            [{ ...shape, points: [{ x: 99, y: 1 }] }],
            [shape],
            result,
            () => 'id',
        ),
    ).toThrow('Source shapes changed');
    expect(() =>
        applyArtworkPattern([shape, hole], [shape], result, () => 'id'),
    ).toThrow('Source groups changed');
});
test('rejects invalid counts, gaps, images, coordinates and excessive copies before allocation', () => {
    for (const settings of [
        mirror({ position: NaN }),
        { kind: 'rectangular', rows: 2, columns: 1.5, gapX: 1, gapY: 1 },
        { kind: 'rectangular', rows: 1000, columns: 1000, gapX: 1, gapY: 1 },
        { kind: 'rectangular', rows: 1, columns: 1, gapX: 1, gapY: 1 },
        { kind: 'rectangular', rows: 2, columns: 2, gapX: -1, gapY: 1 },
        {
            kind: 'circular',
            count: 3,
            centerX: 0,
            centerY: 0,
            sweep: 0,
            rotateCopies: true,
        },
    ] as PatternSettings[])
        expect(() => patternArtwork([shape], settings)).toThrow();
    expect(() =>
        patternArtwork([{ ...shape, bitmapId: 'image' }], mirror()),
    ).toThrow('without images');
    expect(() =>
        patternArtwork([shape], mirror({ position: 1000000 })),
    ).toThrow('coordinate limits');
    const detailed = {
        ...shape,
        points: Array.from({ length: 10001 }, () => ({ x: 1, y: 2 })),
    };
    expect(() =>
        patternArtwork([detailed], {
            kind: 'rectangular',
            columns: 101,
            rows: 1,
            gapX: 1,
            gapY: 1,
        }),
    ).toThrow('Too many copies');
});
