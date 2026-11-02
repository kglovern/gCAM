import { createLaserToolpath } from '../cam/laser.js';
import { createStrokeText } from '../engine/cad-font.js';
import { jobStockBounds, type JobStock } from '../job/stock';
import { makeToolpathConfig, type LaserOptions } from './toolpathRequest';

export interface IntervalTestSettings {
    min: number;
    max: number;
    steps: number;
    size: number;
    feed: number;
    power: number;
    labelPower: number;
    overscan: number;
    pattern: 'solid' | 'dither';
}
export function buildIntervalTest(
    settings: IntervalTestSettings,
    stock: JobStock,
    options: LaserOptions = {},
    maxFeed = Infinity,
) {
    const {
        min,
        max,
        steps,
        size,
        feed,
        power,
        labelPower,
        overscan,
        pattern,
    } = settings;
    if (stock.laserRotary)
        throw new Error('Interval calibration requires flat laser mode.');
    if (
        ![
            min,
            max,
            steps,
            size,
            feed,
            power,
            labelPower,
            overscan,
            stock.widthMm,
            stock.heightMm,
        ].every(Number.isFinite) ||
        min < 0.02 ||
        max > 1 ||
        max <= min ||
        !Number.isInteger(steps) ||
        steps < 2 ||
        steps > 12 ||
        size < 8 ||
        size > 20 ||
        feed <= 0 ||
        feed > maxFeed ||
        power <= 0 ||
        power > 1000 ||
        labelPower <= 0 ||
        labelPower > 1000 ||
        overscan < 0 ||
        overscan > 20 ||
        !['solid', 'dither'].includes(pattern)
    )
        throw new Error('Check interval test ranges and machine feed limit.');
    if ((max - min) / (steps - 1) < 0.001 - 1e-10)
        throw new Error('Interval steps must differ by at least 0.001 mm.');
    if (steps * Math.ceil(size / min) ** 2 > 200000)
        throw new Error(
            'Interval test is too dense; reduce sample size or steps.',
        );
    const pitchX = size + 5 + 2 * overscan,
        pitchY = size + 8;
    const cols = Math.min(steps, Math.floor((stock.widthMm - 10) / pitchX));
    if (cols < 1 || stock.heightMm < Math.ceil(steps / cols) * pitchY + 10)
        throw new Error('Interval test does not fit the stock.');
    const bounds = jobStockBounds(stock);
    const samples = [];
    const paths = [];
    const preview = [];
    let base: Record<string, unknown> = {};
    for (let i = 0; i < steps; i++) {
        const interval = min + ((max - min) * i) / (steps - 1);
        const x = bounds.minX + 5 + overscan + (i % cols) * pitchX;
        const y = bounds.minY + 5 + Math.floor(i / cols) * pitchY;
        const square = [
            { x, y: y + 4 },
            { x: x + size, y: y + 4 },
            { x: x + size, y: y + 4 + size },
            { x, y: y + 4 + size },
            { x, y: y + 4 },
        ];
        const config = makeToolpathConfig({
            operation: pattern === 'solid' ? 'laser-fill' : 'laser-raster',
            toolDiameter: 1,
            cutDepth: 1,
            laserFeed: feed,
            laserPower: power,
            laserSMax: power,
            laserSMin: 0,
            laserGamma: 1,
            laserSpot: interval,
            laserOverscan: overscan,
            laserOptions: {
                powerMode: options.powerMode ?? 'profile',
                airAssist: options.airAssist ?? false,
                bidirectional: options.bidirectional ?? true,
                ...(options.scanAlignment
                    ? { scanAlignment: options.scanAlignment }
                    : {}),
                hatchOverscan: true,
                imageMode: 'jarvis',
            },
        });
        const result = createLaserToolpath(
            [{ points: square }],
            config,
            pattern === 'solid'
                ? {}
                : {
                      sourceEntities: [
                          {
                              type: 'BITMAP',
                              bounds: {
                                  minX: x,
                                  minY: y + 4,
                                  maxX: x + size,
                                  maxY: y + 4 + size,
                              },
                              _imageData: {
                                  width: 64,
                                  height: 1,
                                  data: Array.from({ length: 64 }, (_, n) => [
                                      (n * 255) / 63,
                                      (n * 255) / 63,
                                      (n * 255) / 63,
                                      255,
                                  ]).flat(),
                              },
                          },
                      ],
                  },
        );
        base = result;
        paths.push(...result.laserPaths);
        preview.push(...result.previewContours);
        const labels = createLaserToolpath(
            createStrokeText(interval.toFixed(3), { x, y }, 2).map(
                (points) => ({ points }),
            ),
            makeToolpathConfig({
                ...config,
                operation: 'laser-cut',
                laserPower: labelPower,
                laserOptions: {
                    powerMode: options.powerMode ?? 'profile',
                    airAssist: options.airAssist ?? false,
                    passes: 1,
                    optimizeTravel: false,
                    innerFirst: false,
                },
            }),
        );
        paths.push(...labels.laserPaths);
        preview.push(...labels.previewContours);
        samples.push({ interval, x, y, size });
    }
    return {
        samples,
        frame: [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.minX + 10 + cols * pitchX, y: bounds.minY },
            {
                x: bounds.minX + 10 + cols * pitchX,
                y: bounds.minY + 10 + Math.ceil(steps / cols) * pitchY,
            },
            {
                x: bounds.minX,
                y: bounds.minY + 10 + Math.ceil(steps / cols) * pitchY,
            },
        ],
        path: {
            ...base,
            operation: 'laser-raster',
            laserSpot: min,
            label: 'Interval test - engraved labels in mm',
            laserPaths: paths,
            previewContours: preview,
        },
    };
}
