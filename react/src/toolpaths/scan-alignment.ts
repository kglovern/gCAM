import { validateScanAlignment } from '../cam/scan-alignment.js';
import { createLaserToolpath } from '../cam/laser.js';
import { makeToolpathConfig, type LaserOptions } from './toolpathRequest';
import { jobStockBounds, type JobStock } from '../job/stock';

export type ScanAlignment = NonNullable<LaserOptions['scanAlignment']>;
const key = (device: string) =>
    `gcam.scanAlignment.v1.${encodeURIComponent(device)}`;
export function loadScanAlignment(device: string): ScanAlignment | undefined {
    try {
        const raw = localStorage.getItem(key(device));
        return raw ? validateScanAlignment(JSON.parse(raw)) : undefined;
    } catch {
        return undefined;
    }
}
export function saveScanAlignment(device: string, value: ScanAlignment) {
    localStorage.setItem(
        key(device),
        JSON.stringify(validateScanAlignment(value)),
    );
}

export function buildScanAlignmentTest({
    feeds,
    power,
    overscan,
    stock,
    maxFeed = Infinity,
}: {
    feeds: number[];
    power: number;
    overscan: number;
    stock: JobStock;
    maxFeed?: number;
}) {
    if (stock.laserRotary)
        throw new Error('Use flat laser mode for scan alignment calibration.');
    const sorted = [...feeds].sort((a, b) => a - b);
    if (
        sorted.length < 2 ||
        sorted.length > 24 ||
        sorted.some(
            (v, i) =>
                !Number.isFinite(v) ||
                v <= 0 ||
                v > maxFeed ||
                (i > 0 && v === sorted[i - 1]),
        )
    )
        throw new Error(
            'Choose two or more different test speeds within the machine limit.',
        );
    if (
        !Number.isFinite(power) ||
        power <= 0 ||
        power > 1000 ||
        !Number.isFinite(overscan) ||
        overscan < 2.5
    )
        throw new Error(
            'Set test power above zero and overscan of at least 2.5 mm.',
        );
    if (
        stock.widthMm < 60 + 2 * overscan ||
        stock.heightMm < sorted.length * 15 + 5
    )
        throw new Error(
            'Scan alignment test does not fit the stock. Increase stock or reduce test speeds.',
        );
    const bounds = jobStockBounds(stock);
    const paths: {
        points: { x: number; y: number; power: number }[];
        feed?: number;
    }[] = [];
    let base: Record<string, unknown> = {};
    for (const [i, feed] of sorted.entries()) {
        const x = bounds.minX + 5 + overscan,
            y = bounds.minY + 5 + i * 15;
        const result = createLaserToolpath(
            [],
            makeToolpathConfig({
                operation: 'laser-raster',
                toolDiameter: 1,
                cutDepth: 1,
                laserFeed: feed,
                laserPower: power,
                laserSpot: 0.5,
                laserSMax: power,
                laserOverscan: overscan,
                laserOptions: {
                    bidirectional: true,
                    scanAlignment: { enabled: false, measurements: [] },
                },
            }),
            {
                sourceEntities: [
                    {
                        type: 'BITMAP',
                        bounds: {
                            minX: x,
                            minY: y,
                            maxX: x + 50,
                            maxY: y + 10,
                        },
                        _imageData: {
                            width: 1,
                            height: 1,
                            data: [0, 0, 0, 255],
                        },
                    },
                ],
            },
        );
        base = result;
        paths.push(...result.laserPaths.map((p) => ({ ...p, feed })));
    }
    return {
        ...base,
        label: `Scan alignment test; speeds bottom to top, mm/min: ${sorted.join(', ')}`,
        laserPaths: paths,
    };
}
