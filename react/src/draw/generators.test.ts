import { buildToolpathGcode } from '../lib/engine';
import { generateShape, type GeneratorOptions } from './generators';
const options: GeneratorOptions = {
    x: 0,
    y: 0,
    endX: 50,
    endY: 0,
    width: 10,
    height: 40,
    radius: 3,
    diameter: 300,
    font: 'single-line',
};
const bounds = (points: { x: number; y: number }[]) => ({
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
});
test('slot uses two end centres and width, with a closed outline', async () => {
    const [slot] = await generateShape('slot', options);
    expect(bounds(slot.points)).toEqual({
        minX: -5,
        maxX: 55,
        minY: -5,
        maxY: 5,
    });
    expect(slot.points[0]).toEqual(slot.points[slot.points.length - 1]);
    const [vertical] = await generateShape('slot', {
        ...options,
        endX: 0,
        endY: 50,
    });
    expect(bounds(vertical.points).minX).toBeCloseTo(-5);
    expect(bounds(vertical.points).maxY).toBeCloseTo(55);
});
test('ellipse and rounded rectangle have the requested centre and dimensions', async () => {
    for (const kind of ['ellipse', 'rounded-rectangle'] as const) {
        const [shape] = await generateShape(kind, {
            ...options,
            x: 20,
            y: -10,
            width: 100,
            height: 40,
        });
        expect(bounds(shape.points)).toEqual({
            minX: -30,
            maxX: 70,
            minY: -30,
            maxY: 10,
        });
        expect(shape.points[0]).toEqual(shape.points[shape.points.length - 1]);
    }
});
test('clock is centred on origin regardless of placement inputs, with upright numerals inside its diameter', async () => {
    const clock = await generateShape('clock', { ...options, x: 999, y: 999 });
    expect(clock.length).toBeGreaterThan(12);
    expect(bounds(clock[0].points)).toEqual({
        minX: -150,
        maxX: 150,
        minY: -150,
        maxY: 150,
    });
    for (const loop of clock.slice(1))
        for (const point of loop.points)
            expect(Math.hypot(point.x, point.y)).toBeLessThan(150);
    const labels = bounds(clock.slice(1).flatMap((loop) => loop.points));
    expect(labels.maxY).toBeGreaterThan(110);
    expect(labels.minX).toBeLessThan(-110);
});
test('invalid dimensions and coincident slot ends are rejected', async () => {
    await expect(
        generateShape('slot', { ...options, endX: 0 }),
    ).rejects.toThrow(/different/);
    await expect(
        generateShape('ellipse', { ...options, width: 0 }),
    ).rejects.toThrow(/width/);
    await expect(
        generateShape('rounded-rectangle', { ...options, radius: 9 }),
    ).rejects.toThrow(/radius/);
    await expect(
        generateShape('clock', { ...options, diameter: NaN }),
    ).rejects.toThrow(/diameter/);
});

test('generated ellipse exports negative coordinates around the origin without translation', async () => {
    const loops = await generateShape('ellipse', {
        ...options,
        width: 100,
        height: 60,
    });
    const result = await buildToolpathGcode({
        loops,
        operation: 'engrave',
        toolDiameter: 3,
        cutDepth: 1,
    });
    expect(result.gcode).toMatch(/X-50(?:\D|$)/);
    expect(result.gcode).toMatch(/Y-30(?:\D|$)/);
});
