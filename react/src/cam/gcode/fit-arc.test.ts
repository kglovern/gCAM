import { fitArcRun } from './fit-arc.js';

function arc(degrees = 90, direction = 1, count = 100) {
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle = (((direction * index) / count) * degrees * Math.PI) / 180;
        return {
            x: 50 + 10 * Math.cos(angle),
            y: 20 + 10 * Math.sin(angle),
            power: 400,
        };
    });
}

test.each([
    [1, 'G3'],
    [-1, 'G2'],
])('fits a translated arc in direction %s', (direction, command) => {
    const result = fitArcRun(arc(90, Number(direction)), 0);
    expect(result).toEqual({ end: 100, i: -10, j: 0, command });
});

test('splits runs at power changes, including bridges', () => {
    const points = arc();
    points[40].power = 0;
    expect(fitArcRun(points, 0)?.end).toBe(32);
    expect(fitArcRun(points, 39)).toBeNull();
    expect(fitArcRun(points, 40)?.end).toBe(100);
});

test('rejects straight lines, outliers, reversed motion and coarse chords', () => {
    expect(
        fitArcRun(
            Array.from({ length: 20 }, (_, x) => ({ x, y: 0 })),
            0,
        ),
    ).toBeNull();
    const noisy = arc();
    noisy[1].x += 0.1;
    expect(fitArcRun(noisy, 0)).toBeNull();
    const reversed = arc();
    reversed[3] = reversed[1];
    expect(fitArcRun(reversed, 0)).toBeNull();
    expect(fitArcRun(arc(90, 1, 4), 0)).toBeNull();
});

test('caps sweep and work per run while preserving the original endpoint index', () => {
    expect(fitArcRun(arc(350), 0)?.end).toBe(32);
    expect(fitArcRun(arc(90, 1, 10000), 0)?.end).toBe(1024);
    expect(fitArcRun(arc().slice(0, 4), 0)).toBeNull();
});

test('checks interior chords against the rounded commanded circle', () => {
    const points = arc(135, -1, 127);
    const result = fitArcRun(points, 0)!;
    const cx = Number(points[0].x.toFixed(4)) + result.i;
    const cy = Number(points[0].y.toFixed(4)) + result.j;
    const radius = Math.hypot(result.i, result.j);
    for (let index = 1; index <= result.end; index++) {
        for (let step = 0; step <= 10; step++) {
            const t = step / 10;
            const x = points[index - 1].x * (1 - t) + points[index].x * t;
            const y = points[index - 1].y * (1 - t) + points[index].y * t;
            expect(
                Math.abs(Math.hypot(x - cx, y - cy) - radius),
            ).toBeLessThanOrEqual(0.02);
        }
    }
});
