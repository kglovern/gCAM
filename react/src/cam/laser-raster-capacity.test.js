import { createLaserToolpath } from './laser.js';
import { largeRasterRequest } from './fixtures/laser-large-raster.js';

test.each(['grayscale', 'jarvis'])(
    'plans a six-million-sample %s raster with correct geometry and power',
    (mode) => {
        const { config, options } = largeRasterRequest({ mode });
        const result = createLaserToolpath([], config, options);
        expect(result.laserPaths).toHaveLength(2000);
        expect(result.previewContours).toHaveLength(2000);
        const first = result.laserPaths[0].points;
        expect(first.map((p) => p.power)).toEqual([0, 0, 750, 0]);
        expect(first.map((p) => p.x)).toEqual([8, 10, 310, 312]);
        expect(first[0].y).toBeCloseTo(20.05, 8);
        const last = result.laserPaths[1999].points;
        expect(last.map((p) => p.x)).toEqual([312, 310, 10, 8]);
        expect(last[0].y).toBeCloseTo(219.95, 8);
    },
);

test('rejects an excessive expanded output while still near the start of sampling', () => {
    const { config, options } = largeRasterRequest({
        detail: 'stripes',
        passes: 100,
    });
    let percent = 0;
    expect(() =>
        createLaserToolpath([], config, {
            ...options,
            onProgress: (p) => {
                percent = p;
            },
        }),
    ).toThrow('Laser job is too large');
    expect(percent).toBeLessThan(15);
});

test('keeps sample and row-width limits ahead of buffer allocation', () => {
    const over = largeRasterRequest({ width: 401, height: 400 });
    expect(() => createLaserToolpath([], over.config, over.options)).toThrow(
        '16 million',
    );
    const wide = largeRasterRequest({ width: 100000.1, height: 0.1 });
    expect(() => createLaserToolpath([], wide.config, wide.options)).toThrow(
        'scan row is too wide',
    );
    const boundary = largeRasterRequest({ width: 400, height: 400 });
    expect(() =>
        createLaserToolpath([], boundary.config, {
            ...boundary.options,
            onProgress: () => {
                throw new Error('Sampling started');
            },
        }),
    ).toThrow('Sampling started');
});
