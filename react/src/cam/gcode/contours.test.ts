import { emitProfileContourMoves } from './contours.js';

function circle(degrees = 360, direction = 1, radius = 10, count = 100) {
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle =
            (direction *
                (degrees === 360 && index === count
                    ? 0
                    : (index * degrees) / count) *
                Math.PI) /
            180;
        return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
}

function emit(points: { x: number; y: number }[], forcePolyline = false) {
    const lines: string[] = [];
    emitProfileContourMoves(lines, points, -1, 1000, 100, forcePolyline, {
        trochoidEnabled: false,
    });
    return lines;
}

describe('profile circle arc output', () => {
    test.each([
        [1, 'G3'],
        [-1, 'G2'],
    ])('preserves traversal direction %s', (direction, command) => {
        const lines = emit(circle(360, Number(direction)));
        expect(lines.length).toBeLessThan(10);
        expect(lines.every((line) => line.startsWith(`${command} `))).toBe(
            true,
        );
        expect(lines[lines.length - 1]).toContain('X10 Y0');
    });

    test('does not close a near-complete open arc', () => {
        const lines = emit(circle(350));
        expect(lines.length).toBeLessThan(100);
        expect(lines[lines.length - 1]).toContain('X9.8481 Y-1.7365');
    });

    test('retains forced polylines for controllers without arcs', () => {
        expect(emit(circle(), true)).toHaveLength(100);
    });

    test('does not erase retraced motion', () => {
        const points = circle();
        points.splice(40, 0, points[38], points[39]);
        const lines = emit(points);
        expect(lines.length).toBeGreaterThan(3);
        expect(lines).toContain(
            `G1 X${Number(points[40].x.toFixed(4))} Y${Number(points[40].y.toFixed(4))} F1000`,
        );
    });

    test('does not collapse multiple turns into a single circle', () => {
        const points = circle();
        expect(emit([...points, ...points.slice(1)]).length).toBeGreaterThan(4);
    });

    test('bounds deviation between vertices on a coarse large circle', () => {
        expect(
            emit(circle(360, 1, 100, 16)).every((line) =>
                line.startsWith('G1'),
            ),
        ).toBe(true);
    });
});
