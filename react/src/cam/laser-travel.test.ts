import { orderLaserCuts, laserTravel } from './laser-order.js';
import { refineLaserRoute } from './laser-travel.js';
import { orderLaserCuts as reference } from '../../scripts/fixtures/laser-order-reference.mjs';
import { createLaserToolpath } from './laser.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { pointAtDistance } from '../geometry/primitives.js';

const square = (id: string, x: number, y: number, size = 3) => ({
    id,
    points: [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
        { x, y },
    ],
});
function fixture(seed = 1, count = 20) {
    let state = seed;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const columns = Math.ceil(Math.sqrt(count));
    const input = Array.from({ length: count }, (_, n) =>
        square(
            String(n),
            (n % columns) * 30 + 5 + random() * 7,
            Math.floor(n / columns) * 30 + 5 + random() * 7,
        ),
    );
    for (let index = count - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [input[index], input[other]] = [input[other], input[index]];
    }
    return input;
}

test('improves a matched greedy route while keeping every chosen start, edge, winding and source record', () => {
    const source = fixture(),
        before = JSON.stringify(source),
        options = { innerFirst: true, optimizeTravel: true };
    const greedy = reference(source, options),
        result = orderLaserCuts(source, options);
    expect(laserTravel(result)).toBeLessThan(laserTravel(greedy) * 0.99);
    expect(result.map((path) => JSON.stringify(path)).sort()).toEqual(
        greedy.map((path) => JSON.stringify(path)).sort(),
    );
    expect(JSON.stringify(source)).toBe(before);
});

test('keeps nested holes before their containers and respects explicit directional order', () => {
    const source = [
        square('outer', 1, 1, 100),
        square('hole', 10, 10, 10),
        square('island', 12, 12, 2),
        ...fixture(2).map((p) => ({
            ...p,
            points: p.points.map((v) => ({ x: v.x + 200, y: v.y })),
        })),
    ];
    const result = orderLaserCuts(source, {
        innerFirst: true,
        optimizeTravel: true,
    });
    const ids = result.map((p) => p.id);
    expect(ids.indexOf('island')).toBeLessThan(ids.indexOf('hole'));
    expect(ids.indexOf('hole')).toBeLessThan(ids.indexOf('outer'));
    const directional = {
        innerFirst: true,
        optimizeTravel: true,
        cutOrder: 'left-to-right',
    };
    const sorted = fixture()
        .slice()
        .sort((a, b) => a.points[0].x - b.points[0].x)
        .map((path) => path.id);
    expect(
        orderLaserCuts(fixture(), directional).map((path) => path.id),
    ).toEqual(sorted);
});

test('scores the actual rapid moves across passes, leads and final-pass overcut', () => {
    const job = createLaserToolpath(
        fixture(7, 5),
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: 1200,
            laserPower: 400,
            laserOptions: {
                passes: 3,
                leadInLength: 0.5,
                leadOutLength: 0.5,
                overcut: 1,
                optimizeTravel: true,
            },
        }),
    );
    const code = exportToolpaths([job], 'travel', false, 'metric');
    let x = 0,
        y = 0,
        travel = 0;
    for (const line of code.split('\n')) {
        if (!/^G[01]\b/.test(line)) continue;
        const nextX = line.match(/\bX(-?[\d.]+)/),
            nextY = line.match(/\bY(-?[\d.]+)/);
        const nx = nextX ? Number(nextX[1]) : x,
            ny = nextY ? Number(nextY[1]) : y;
        if (/^G0\b/.test(line)) travel += Math.hypot(nx - x, ny - y);
        x = nx;
        y = ny;
    }
    expect(
        laserTravel(job.laserPaths, undefined, job.laserOptions),
    ).toBeCloseTo(travel, 2);
});

test('never lengthens matched routes with repeated passes, weak bridges, leads or overcut', () => {
    for (const extra of [
        {},
        { passes: 3 },
        { leadInLength: 0.3, leadOutLength: 0.3, overcut: 1, passes: 2 },
        { bridges: true, bridgePower: 0.2, bridgeCount: 2, bridgeWidth: 0.2 },
    ]) {
        const source = fixture(4, 12);
        const base = orderLaserCuts(source, {
            innerFirst: true,
            optimizeTravel: false,
            ...extra,
        });
        const result = orderLaserCuts(source, {
            innerFirst: true,
            optimizeTravel: true,
            ...extra,
        });
        expect(laserTravel(result, undefined, extra)).toBeLessThanOrEqual(
            laserTravel(base, undefined, extra) + 1e-7,
        );
        const edges = (
            paths: { points: { x: number; y: number; power?: number }[] }[],
        ) =>
            paths
                .flatMap((path) =>
                    path.points
                        .slice(1)
                        .map((b, i) =>
                            JSON.stringify([
                                path.points[i].x,
                                path.points[i].y,
                                b.x,
                                b.y,
                                b.power,
                            ]),
                        ),
                )
                .sort();
        expect(edges(result)).toEqual(edges(base));
    }
});

test('dense dependency graphs use the existing route rather than unbounded local search', () => {
    const paths = fixture(5, 500),
        route = { paths, indices: paths.map((_, index) => index) };
    const children = paths.map((_, index) =>
        Array.from({ length: index }, (_, child) => child),
    );
    expect(refineLaserRoute(route, children, null, {})).toBe(route);
});

test('legacy index-only manual bridges retain their physical contour under the previous route', () => {
    const source = fixture();
    const original = reference(source, {
        innerFirst: true,
        optimizeTravel: true,
    });
    const expected = pointAtDistance(original[4].points, 3.5);
    const job = createLaserToolpath(
        source,
        makeToolpathConfig({
            operation: 'laser-cut',
            toolDiameter: 1,
            cutDepth: 1,
            laserPower: 400,
            laserOptions: { bridgeWidth: 1, passes: 3 },
            laserManualTabs: [{ contourIndex: 4, along: 3.5 }],
        }),
    );
    const path = job.laserPaths[4];
    const gap = path.points.findIndex((point) => point.power === 0);
    const a = path.points[gap - 1],
        b = path.points[gap];
    expect((a.x + b.x) / 2).toBeCloseTo(expected.x, 8);
    expect((a.y + b.y) / 2).toBeCloseTo(expected.y, 8);
});
