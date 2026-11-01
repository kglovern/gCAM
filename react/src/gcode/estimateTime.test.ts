import { estimateProgramTime, type TimingSettings } from './estimateTime';
const settings: TimingSettings = {
    maxSpeed: [6000, 6000, 6000],
    acceleration: [100, 100, 100],
    start: [0, 0, 0],
    junctionDeviation: 0.01,
};
const estimate = (code: string, overrides: Partial<TimingSettings> = {}) =>
    estimateProgramTime(code, { ...settings, ...overrides });

test('analytical trapezoidal and triangular rest-to-rest moves', async () => {
    const long = await estimate('G1 X100 F600');
    expect(long.seconds).toBeCloseTo(10.1, 8);
    expect(long.nominalSeconds).toBe(10);
    expect((await estimate('G1 X1 F6000')).seconds).toBeCloseTo(0.2, 8);
});
test('collinear subdivisions retain speed; reversals and exact stops brake', async () => {
    expect((await estimate('G1 X10 F600\nX20\nX30')).seconds).toBeCloseTo(
        3.1,
        8,
    );
    expect((await estimate('G1 X10 F600\nX0\nX10')).seconds).toBeCloseTo(
        3.3,
        8,
    );
    expect(
        (await estimate('G1 X10 F600\nX20\nX30', { junctionDeviation: 0 }))
            .seconds,
    ).toBeCloseTo(3.3, 8);
});
test('right-angle junction limit matches an independent analytical calculation', async () => {
    const result = await estimate('G1 X10 F600\nY10');
    const corner = Math.sqrt((100 * 0.01 * Math.SQRT1_2) / (1 - Math.SQRT1_2));
    expect(result.seconds).toBeCloseTo(
        2 * (1 + (10 - corner + corner ** 2 / 20) / 100),
        8,
    );
    expect(
        (await estimate('G1 X10 F600\nY10', { junctionDeviation: 0.1 }))
            .seconds,
    ).toBeLessThan(result.seconds);
});
test('axis projection limits diagonal feed and rapid speed', async () => {
    const diagonal = await estimate('G1 X10 Y10 F6000', {
        maxSpeed: [600, 6000, 6000],
    });
    expect(diagonal.nominalSeconds).toBeCloseTo(1, 8);
    expect(diagonal.seconds).toBeGreaterThan(1);
    expect(
        (await estimate('G0 X100', { maxSpeed: [600, 6000, 6000] })).seconds,
    ).toBeCloseTo(10.1, 8);
});
test('units, relative positions, initial coordinates and modal feed', async () => {
    const metric = await estimate('G21 G90 G1 X25.4 F1524\nG91 X25.4');
    const imperial = await estimate('G20 G90 G1 X1 F60\nG91 X1');
    expect(imperial.seconds).toBeCloseTo(metric.seconds, 8);
    expect(
        (await estimate('G1 X110 F600', { start: [100, 0, 0] })).seconds,
    ).toBeCloseTo(1.1, 8);
    expect((await estimate('G21 G1 X25.4 F1524\nG20 X2')).seconds).toBeCloseTo(
        metric.seconds,
        8,
    );
});
test('dwell barriers, controller dwell units and monotonic source timeline', async () => {
    const result = await estimate('G1 X10 F600\nG4 P2\nX20\nM30\nX1000');
    expect(result.seconds).toBeCloseTo(4.2, 8);
    expect(result.dwellSeconds).toBe(2);
    for (const [i, value] of [1.1, 3.1, 4.2, 4.2, 4.2].entries())
        expect(result.lineEndSeconds[i]).toBeCloseTo(value, 8);
    expect(
        (await estimateProgramTime('G4 P2000', settings, 'P-milliseconds'))
            .seconds,
    ).toBe(2);
    expect(
        (await estimateProgramTime('G4 S2', settings, 'S-seconds')).seconds,
    ).toBe(2);
    await expect(
        estimateProgramTime('G4 P2', settings, 'S-seconds'),
    ).rejects.toThrow('Dwell');
});
test('quarter/full/helical arcs, signed R and different planes', async () => {
    const start: [number, number, number] = [10, 0, 0];
    const quarter = await estimate('G3 X0 Y10 I-10 J0 F600', { start });
    expect(quarter.distanceMm).toBeCloseTo(5 * Math.PI, 2);
    expect(
        (await estimate('G2 I-10 J0 F600', { start })).distanceMm,
    ).toBeCloseTo(20 * Math.PI, 2);
    expect(
        (await estimate('G3 X0 Y10 R10 F600', { start })).distanceMm,
    ).toBeCloseTo(quarter.distanceMm, 4);
    expect(
        (await estimate('G3 X0 Y10 R-10 F600', { start })).distanceMm,
    ).toBeCloseTo(15 * Math.PI, 2);
    expect(
        (await estimate('G3 X0 Y10 Z5 I-10 F600', { start })).distanceMm,
    ).toBeCloseTo(Math.hypot(5 * Math.PI, 5), 2);
    expect(
        (await estimate('G18 G3 Z0 X10 K-10 F600', { start: [0, 0, 10] }))
            .distanceMm,
    ).toBeCloseTo(quarter.distanceMm, 4);
});
test.each([
    'G93 G1 X10 F2',
    'G53 G0 X0',
    'G92 X0',
    'M0',
    'G1 A90 F100',
    'M98 P1',
    'G1 X[1+2]',
    'G2 X1 Y1 R0.1 F600',
    'G4 P-1',
    'G1 X1 F0',
    'G90.1',
    'G55',
    'G20 G21 G1 X1 F600',
    'G1 X1 I2 F600',
])('rejects unsupported/invalid program: %s', async (code) => {
    await expect(estimate(code)).rejects.toThrow();
});
test('chunk boundary keeps continuous trajectory and source mapping', async () => {
    const count = 17000;
    const code = Array.from(
        { length: count },
        (_, i) => 'G1 X' + (i + 1) + ' F600',
    ).join('\n');
    const result = await estimate(code);
    expect(result.seconds).toBeCloseTo(count / 10 + 0.1, 6);
    expect(result.lineEndSeconds[count - 1]).toBe(result.seconds);
    expect(result.moves).toBe(count);
});
test('invalid machine assumptions cannot produce a number', async () => {
    await expect(
        estimate('G1 X10 F600', { acceleration: [0, 100, 100] }),
    ).rejects.toThrow('positive');
    await expect(
        estimate('G1 X10 F600', { start: [NaN, 0, 0] }),
    ).rejects.toThrow('start');
});

test('modal full circles, comments and centripetal speed bounds', async () => {
    const result = await estimate(
        'G2 I-10 F60000 (full circle)\nI-10 ; again',
        { start: [10, 0, 0] },
    );
    expect(result.distanceMm).toBeCloseTo(40 * Math.PI, 2);
    expect(result.seconds).toBeGreaterThan(
        result.distanceMm / Math.sqrt(100 * 10),
    );
    await expect(estimate('G1 X1 X2 F600')).rejects.toThrow('Repeated');
    await expect(estimate('G1 X99999999999 F600')).rejects.toThrow(
        'coordinate budget',
    );
});

test('numeric underflow and accumulated time precision fail instead of returning invalid clocks', async () => {
    const tinyFeed = '0.' + '0'.repeat(200) + '1';
    await expect(estimate('G1 X1 F' + tinyFeed)).rejects.toThrow(
        /precision|numeric/i,
    );
    await expect(
        estimate('G1 X1 F600', { maxSpeed: [1e-200, 100, 100] }),
    ).rejects.toThrow(/precision|numeric/i);
    const huge = '9'.repeat(308);
    await expect(estimate('G4 P' + huge + '\nG4 P' + huge)).rejects.toThrow(
        /precision|numeric/i,
    );
    await expect(
        estimate('G4 P100000000000000000000\nG1 X1 F600'),
    ).rejects.toThrow(/precision|numeric/i);
    await expect(estimate('G20 G1 X1 F' + huge)).rejects.toThrow(
        /feed|numeric/i,
    );
});

test('multi-turn circular and helical arcs include every programmed revolution', async () => {
    const start: [number, number, number] = [10, 0, 0];
    const circle = await estimate('G2 I-10 P2 F600', { start });
    expect(circle.distanceMm).toBeCloseTo(40 * Math.PI, 2);
    const helix = await estimate('G3 X0 Y10 Z5 I-10 P2 F600', { start });
    expect(helix.distanceMm).toBeCloseTo(Math.hypot(25 * Math.PI, 5), 2);
    for (const turns of [0, -1, 1.5])
        await expect(
            estimate('G2 I-10 P' + turns + ' F600', { start }),
        ).rejects.toThrow('integer');
});
