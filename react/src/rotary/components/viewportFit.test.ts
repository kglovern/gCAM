import { rotaryViewFit } from './viewportFit';
test('camera fit scales for long stock and narrow viewports', () => {
    const normal = rotaryViewFit(90, 25.4, 1.5);
    expect(rotaryViewFit(1000, 100, 1.5).distance).toBeGreaterThan(
        normal.distance * 5,
    );
    expect(rotaryViewFit(90, 25.4, 0.5).distance).toBeGreaterThan(
        normal.distance,
    );
    expect(normal.centerX).toBe(45);
});
