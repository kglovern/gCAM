import { fitImageViewport, zoomImageViewport } from './imageViewport';
test('fit preserves aspect and centres a wide or tall image with padding', () => {
    expect(fitImageViewport(100, 50, 216, 116)).toEqual({
        scale: 2,
        x: 8,
        y: 8,
    });
    expect(fitImageViewport(100, 200, 216, 216)).toEqual({
        scale: 1,
        x: 58,
        y: 8,
    });
});
test.each([
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    { x: 400, y: 300 },
])('zoom preserves the image point under the cursor %p', (anchor) => {
    const view = { scale: 0.5, x: 12, y: 25 },
        next = zoomImageViewport(view, 3, anchor);
    expect((anchor.x - next.x) / next.scale).toBeCloseTo(
        (anchor.x - view.x) / view.scale,
    );
    expect((anchor.y - next.y) / next.scale).toBeCloseTo(
        (anchor.y - view.y) / view.scale,
    );
});
test('zoom out reverses zoom in without drifting the shared view', () => {
    const view = { scale: 1.2, x: -25, y: 30 },
        anchor = { x: 160, y: 120 };
    const next = zoomImageViewport(
        zoomImageViewport(view, 1.5, anchor),
        1 / 1.5,
        anchor,
    );
    expect(next.scale).toBeCloseTo(view.scale);
    expect(next.x).toBeCloseTo(view.x);
    expect(next.y).toBeCloseTo(view.y);
});
test('actual-pixel zoom and range limits still preserve the anchor', () => {
    const anchor = { x: 100, y: 100 },
        view = { scale: 0.25, x: 10, y: 15 };
    expect(zoomImageViewport(view, 1 / view.scale, anchor).scale).toBe(1);
    expect(zoomImageViewport(view, 1e10, anchor).scale).toBe(128);
    expect(zoomImageViewport(view, 1e-10, anchor).scale).toBe(0.000001);
});
test('fitting a tiny image respects the same maximum zoom as the controls', () => {
    const fit = fitImageViewport(1, 1, 800, 600);
    expect(fit.scale).toBe(128);
    expect(zoomImageViewport(fit, 1.5, { x: 400, y: 300 }).scale).toBe(128);
});
