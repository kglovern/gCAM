/**
 * Tests: trims the nearest segment into two remaining paths; rejects clicks outside the trim tolerance.
 */
import { trimNearestSegment, findTrimTarget } from './trim';

test('trims the nearest segment into two remaining paths', () => {
    const result = trimNearestSegment(
        [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ],
        { x: 5, y: 0 },
        1,
    );
    expect(result?.segmentIndex).toBe(0);
    expect(result?.before).toEqual([{ x: 0, y: 0 }]);
    expect(result?.after).toEqual([
        { x: 10, y: 0 },
        { x: 10, y: 10 },
    ]);
});

test('rejects clicks outside the trim tolerance', () => {
    expect(
        trimNearestSegment(
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            { x: 5, y: 4 },
            1,
        ),
    ).toBeNull();
});

const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
];
const boundary = (x: number) => [
    { x, y: -5 },
    { x, y: 5 },
];
test('cuts an unsegmented line at intersections inside its edge', () => {
    const hit = trimNearestSegment(line, { x: 5, y: 0 }, 1, [
        boundary(3),
        boundary(7),
    ]);
    expect(hit?.before).toEqual([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
    ]);
    expect(hit?.after).toEqual([
        { x: 7, y: 0 },
        { x: 10, y: 0 },
    ]);
    expect(hit?.removed).toEqual([
        { x: 3, y: 0 },
        { x: 7, y: 0 },
    ]);
});
test('a sampled curve trims across sampling nodes between crossings', () => {
    const curve = [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 4, y: 3 },
        { x: 6, y: 3 },
        { x: 8, y: 2 },
        { x: 10, y: 0 },
    ];
    const hit = trimNearestSegment(curve, { x: 5, y: 3 }, 1, [
        boundary(1),
        boundary(9),
    ]);
    expect(hit?.before).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
    ]);
    expect(hit?.after).toHaveLength(2);
    expect(hit?.after[0].x).toBeCloseTo(9);
    expect(hit?.after[0].y).toBeCloseTo(1);
    expect(hit?.after[1]).toEqual({ x: 10, y: 0 });
    expect(hit?.removed).toHaveLength(6);
});
test('closed paths remain a single path when trimming across the stored seam', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
    ];
    const cut = [
        { x: -5, y: 5 },
        { x: 15, y: 5 },
    ];
    const hit = trimNearestSegment(square, { x: 5, y: 0 }, 1, [cut]);
    expect(hit?.before).toEqual([
        { x: 10, y: 5 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 5 },
    ]);
    expect(hit?.after).toEqual([]);
    expect(hit?.removed).toEqual([
        { x: 0, y: 5 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
    ]);
});
test('T junctions and duplicate intersection points are usable boundaries', () => {
    const junction = [
        { x: 3, y: 0 },
        { x: 3, y: 5 },
        { x: 3, y: 0 },
    ];
    const hit = trimNearestSegment(line, { x: 5, y: 0 }, 1, [
        junction,
        boundary(7),
    ]);
    expect(hit?.removed).toEqual([
        { x: 3, y: 0 },
        { x: 7, y: 0 },
    ]);
});
test('collinear overlap ends bound the trimmed section', () => {
    const hit = trimNearestSegment(line, { x: 5, y: 0 }, 1, [
        [
            { x: 3, y: 0 },
            { x: 7, y: 0 },
        ],
    ]);
    expect(hit?.removed).toEqual([
        { x: 3, y: 0 },
        { x: 7, y: 0 },
    ]);
});
test('self intersections cut out a loop without trimming unrelated edges', () => {
    const bow = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
    ];
    const hit = trimNearestSegment(bow, { x: 5, y: 10 }, 1);
    expect(hit?.before).toEqual([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
    ]);
    expect(hit?.after).toEqual([
        { x: 5, y: 5 },
        { x: 10, y: 0 },
    ]);
});
test('selected targets still use unselected visible vectors as cutting boundaries', () => {
    const loops = [
        { id: 'target', points: line },
        { id: 'a', points: boundary(3) },
        { id: 'b', points: boundary(7) },
        { id: 'image', bitmapId: 'image', points: boundary(5) },
    ];
    const hit = findTrimTarget(loops, { x: 5, y: 0 }, 1, ['target']);
    expect(hit?.loopId).toBe('target');
    expect(hit?.removed).toEqual([
        { x: 3, y: 0 },
        { x: 7, y: 0 },
    ]);
    expect(
        findTrimTarget(loops, { x: 5, y: 0 }, 1, ['target'], ['a'])?.removed,
    ).toEqual([
        { x: 0, y: 0 },
        { x: 7, y: 0 },
    ]);
    expect(
        findTrimTarget(loops, { x: 5, y: 0 }, 1, ['target'], ['target']),
    ).toBeNull();
});
test('repeated vertices and near misses do not introduce false cuts', () => {
    const path = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
    ];
    const hit = trimNearestSegment(path, { x: 5, y: 0 }, 1, [
        boundary(3),
        [
            { x: 7, y: 0.01 },
            { x: 7, y: 5 },
        ],
    ]);
    expect(hit?.removed).toEqual([
        { x: 3, y: 0 },
        { x: 10, y: 0 },
    ]);
});
