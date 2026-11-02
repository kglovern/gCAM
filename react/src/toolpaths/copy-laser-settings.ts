import { LASER_DEFAULTS, laserOptions } from '../cam/laser.js';
import type { ProfileArgs } from '../lib/engine';
import type { LaserOptions } from './toolpathRequest';

export interface LaserSettingsSource {
    id: string;
    label: string;
    args: ProfileArgs;
    customLabel?: string;
}

/** Copy CAM settings only; geometry, region and device calibration belong to the target. */
export function copyLaserSettings(
    source: ProfileArgs,
    operation: string,
    maxFeed?: number,
) {
    if (
        !['laser-cut', 'laser-fill', 'laser-raster'].includes(operation) ||
        source.operation !== operation
    )
        throw new Error('Choose an operation of the same laser type.');
    const result = {
        feed: source.laserFeed ?? 3000,
        power:
            operation === 'laser-raster'
                ? (source.laserSMax ?? 1000)
                : (source.laserPower ?? 1000),
        interval: source.laserSpot ?? 0.2,
        gamma: source.laserGamma ?? 1,
        minPower: source.laserSMin ?? 0,
        maxPower: source.laserSMax ?? 1000,
        overscan: source.laserOverscan ?? 2,
        options: {} as LaserOptions,
    };
    for (const key of ['feed', 'interval', 'gamma'] as const)
        if (!Number.isFinite(result[key]) || result[key] <= 0)
            throw new Error('Source operation has invalid laser settings.');
    if (
        !Number.isFinite(result.overscan) ||
        result.overscan < 0 ||
        [result.power, result.minPower, result.maxPower].some(
            (v) => !Number.isFinite(v) || v < 0 || v > 1000,
        ) ||
        result.minPower > result.maxPower
    )
        throw new Error('Source operation has invalid laser settings.');
    if (maxFeed && result.feed > maxFeed)
        throw new Error('Source speed exceeds this machine’s feed limit.');
    const normalized = laserOptions(source.laserOptions);
    result.options = Object.fromEntries(
        Object.keys(LASER_DEFAULTS)
            .filter(
                (key) =>
                    ![
                        'imageCrop',
                        'imageMask',
                        'maskSourceIds',
                        'scanAlignment',
                    ].includes(key),
            )
            .map((key) => [key, normalized[key as keyof typeof normalized]]),
    ) as LaserOptions;
    return result;
}

export type CopiedLaserSettings = ReturnType<typeof copyLaserSettings>;
