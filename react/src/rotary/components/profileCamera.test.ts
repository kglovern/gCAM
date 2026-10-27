import { profileCamera, zoomProfileAt } from './profileCamera';

test.each([
    [1000, 180, 90, 25.4],
    [420, 300, 300, 80],
    [800, 240, 1000, 100],
])(
    'profile grid uses a square millimetre scale in %j',
    (w, h, length, diameter) => {
        const camera = profileCamera(w, h, length, diameter, 1, 0, 0);
        expect(camera.x(10) - camera.x(0)).toBeCloseTo(
            camera.r(0) - camera.r(10),
            10,
        );
        expect(camera.invX(camera.x(23))).toBeCloseTo(23, 10);
        expect(camera.invR(camera.r(7))).toBeCloseTo(7, 10);
    },
);

test('wheel zoom anchors both coordinates and keeps square grid proportions', () => {
    const before = profileCamera(800, 240, 90, 25.4, 1, 10, 20);
    const cursor = { x: 350, y: 100 };
    const next = zoomProfileAt(1, 10, 20, 2, cursor.x, cursor.y, 240);
    const after = profileCamera(
        800,
        240,
        90,
        25.4,
        next.zoom,
        next.panX,
        next.panY,
    );
    expect(after.invX(cursor.x)).toBeCloseTo(before.invX(cursor.x), 10);
    expect(after.invR(cursor.y)).toBeCloseTo(before.invR(cursor.y), 10);
    expect(after.x(10) - after.x(0)).toBeCloseTo(after.r(0) - after.r(10), 10);
    expect(after.scale).toBeCloseTo(before.scale * 2, 10);
});
