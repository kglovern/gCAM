import { resolveManualLaserTabs } from './laser-bridges.js';
import { resolveManualLaserTabs as reference } from '../../scripts/fixtures/laser-bridge-reference.mjs';
import { findNearestPolylinePoint } from './tabs.js';

const circle = (x, n) => ({
    points: Array.from({ length: n + 1 }, (_, i) => {
        const angle = ((i % n) * Math.PI * 2) / n;
        return { x: x + 10 * Math.cos(angle), y: 10 * Math.sin(angle) };
    }),
});

test.each([1, 19, 47, 83, 123, 211, 999, 5678])(
    'indexed lookup exactly matches the former resolver for deterministic corpus %s',
    (seed) => {
        let state = seed;
        const random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
        const paths = Array.from({ length: 12 }, (_, i) =>
            circle(i * 30, 75 + Math.floor(random() * 200)),
        );
        const tabs = paths.flatMap((path, contourIndex) =>
            Array.from({ length: 4 }, () => {
                const i = Math.floor(random() * (path.points.length - 1));
                const a = path.points[i],
                    b = path.points[i + 1];
                const t = random();
                return {
                    contourIndex,
                    along: 0,
                    anchor: {
                        x: a.x + (b.x - a.x) * t,
                        y: a.y + (b.y - a.y) * t,
                    },
                };
            }),
        );
        const before = JSON.stringify({ paths, tabs });
        expect(resolveManualLaserTabs(paths, tabs)).toEqual(
            reference(paths, tabs),
        );
        expect(JSON.stringify({ paths, tabs })).toEqual(before);
    },
);

test('preserves duplicate/shared-vertex ties, repeated points, mixed legacy distances and open-path exclusion', () => {
    const square = {
        points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 },
        ],
    };
    const paths = [
        {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
        },
        square,
        JSON.parse(JSON.stringify(square)),
    ];
    const tabs = [
        { contourIndex: 0, along: 0, anchor: { x: 10, y: 0 } },
        { contourIndex: 0, along: 0, anchor: { x: 0, y: 0 } },
        { contourIndex: 1, along: 5 },
    ];
    expect(resolveManualLaserTabs(paths, tabs)).toEqual(reference(paths, tabs));
    expect(resolveManualLaserTabs(paths, tabs)[0].contourIndex).toBe(1);
});

test.each([0.999999e-5, 1e-5, 1.000001e-5])(
    'preserves matching tolerance at %s mm',
    (offset) => {
        const paths = [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 },
                    { x: 0, y: 0 },
                ],
            },
        ];
        const tabs = [
            { contourIndex: 0, along: 0, anchor: { x: 5, y: -offset } },
        ];
        if (offset > 1e-5) {
            expect(() => reference(paths, tabs)).toThrow(/no longer matches/);
            expect(() => resolveManualLaserTabs(paths, tabs)).toThrow(
                /no longer matches/,
            );
        } else
            expect(resolveManualLaserTabs(paths, tabs)).toEqual(
                reference(paths, tabs),
            );
    },
);

test('resolves a detailed multi-part drawing beyond the former scan budget', () => {
    const paths = Array.from({ length: 120 }, (_, i) => circle(i * 30, 1000));
    const tabs = paths.flatMap((path, contourIndex) =>
        [83, 312, 593, 812].map((i) => ({
            contourIndex,
            along: 0,
            anchor: path.points[i],
        })),
    );
    expect(() => reference(paths, tabs)).toThrow(/too complex/);
    const result = resolveManualLaserTabs(paths, tabs);
    result.forEach((tab, i) => {
        expect(tab.contourIndex).toBe(tabs[i].contourIndex);
        expect(tab.along).toBe(
            findNearestPolylinePoint(paths[tab.contourIndex].points, tab.anchor)
                .along,
        );
    });
});
