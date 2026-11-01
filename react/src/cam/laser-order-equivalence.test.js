import { orderLaserCuts, laserTravel } from './laser-order.js';
import { orderLaserCuts as reference } from '../../scripts/fixtures/laser-order-reference.mjs';
const square = (x, y, size) => ({
    points: [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
        { x, y },
    ],
});
function fixtures(seed) {
    let state = seed;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const paths = Array.from({ length: 25 }, (_, i) => {
        const x = (random() - 0.5) * 1000,
            y = (random() - 0.5) * 1000;
        return i % 3
            ? square(x, y, 5 + random() * 40)
            : {
                  points: [
                      { x, y },
                      { x: x + random() * 30, y: y + random() * 30 },
                  ],
              };
    });
    return [...paths, square(0, 0, 100), square(10, 10, 20), square(0, 0, 100)];
}
const records = (paths) => paths.map((path) => JSON.stringify(path)).sort();

test('unoptimized order stays exact; optimized swaps preserve starts, reversals and power without increasing travel', () => {
    for (let seed = 1; seed <= 12; seed++)
        for (const innerFirst of [true, false])
            for (const optimizeTravel of [true, false]) {
                const paths = fixtures(seed),
                    before = JSON.stringify(paths),
                    options = { innerFirst, optimizeTravel };
                const actual = orderLaserCuts(paths, options),
                    original = reference(paths, options);
                if (!optimizeTravel) expect(actual).toEqual(original);
                else {
                    expect(records(actual)).toEqual(records(original));
                    expect(laserTravel(actual)).toBeLessThanOrEqual(
                        laserTravel(original) + 1e-7,
                    );
                }
                expect(JSON.stringify(paths)).toBe(before);
            }
});
test('detailed and perforated contours retain identical physical gaps and starts while reducing travel', () => {
    const paths = fixtures(42).filter((p) => p.points.length > 3);
    for (const options of [
        { perforation: true, perforationCut: 0.3, perforationSkip: 0.2 },
        { bridges: true, bridgeCount: 4, bridgeWidth: 0.1 },
        { bridges: true, bridgeCount: 3, bridgeWidth: 0.1, perforation: true },
    ])
        expect(
            records(
                orderLaserCuts(paths, {
                    innerFirst: true,
                    optimizeTravel: true,
                    ...options,
                }),
            ),
        ).toEqual(
            records(
                reference(paths, {
                    innerFirst: true,
                    optimizeTravel: true,
                    ...options,
                }),
            ),
        );
});
test('equal-distance boxes, inside-box cursors and tiny separations preserve original tie choices', () => {
    const paths = [
        square(-2, -2, 4),
        square(2, 2, 4),
        square(-6, -6, 4),
        square(0, 0, 1e-8),
    ];
    expect(
        orderLaserCuts(paths, { innerFirst: true, optimizeTravel: true }),
    ).toEqual(reference(paths, { innerFirst: true, optimizeTravel: true }));
});
