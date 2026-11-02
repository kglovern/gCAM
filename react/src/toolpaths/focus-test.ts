import { createLaserToolpath } from '../cam/laser.js';
import { createStrokeText } from '../engine/cad-font.js';
import { jobStockBounds, type JobStock } from '../job/stock';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import { makeToolpathConfig, type LaserOptions } from './toolpathRequest';
import { validateLaserFocusTest } from '../cam/laser-focus.js';

export interface FocusTestSettings {
    mode: 'ramp' | 'sweep';
    lengthMm: number;
    samples: number;
    feed: number;
    power: number;
    labelPower: number;
    labelPerforation?: boolean;
    labelCutMm?: number;
    labelSkipMm?: number;
    leftGapMm: number;
    rightGapMm: number;
    controlledZ: boolean;
    minZMm: number;
    maxZMm: number;
    startZMm: number;
    endZMm: number;
    travelZMm: number;
    zFeedMmMin: number;
    clearanceDirection: 1 | -1;
}
export function focusTestDefaults(
    feed: number,
    power: number,
): FocusTestSettings {
    return {
        mode: 'ramp',
        lengthMm: 80,
        samples: 9,
        feed,
        power: Math.min(power || 50, 50),
        labelPower: 25,
        labelPerforation: false,
        labelCutMm: 0.1,
        labelSkipMm: 0.1,
        leftGapMm: 0,
        rightGapMm: 0,
        controlledZ: false,
        minZMm: 0,
        maxZMm: 0,
        startZMm: 0,
        endZMm: 0,
        travelZMm: 0,
        zFeedMmMin: 300,
        clearanceDirection: 1,
    };
}
export function buildFocusTest(
    settings: FocusTestSettings,
    stock: JobStock,
    units: UnitSystem = 'metric',
    options: LaserOptions = {},
    maxFeed = Infinity,
) {
    const s = settings;
    if (
        (s.labelPerforation !== undefined &&
            typeof s.labelPerforation !== 'boolean') ||
        (s.labelPerforation &&
            ![s.labelCutMm ?? 0.1, s.labelSkipMm ?? 0.1].every(
                (v) => Number.isFinite(v) && v >= 0.001 && v <= 100000,
            ))
    )
        throw new Error(
            'Focus label cut/skip lengths must be at least 0.001 mm.',
        );
    if (stock.laserRotary)
        throw new Error('Focus tests require flat laser mode.');
    if (
        ![
            s.lengthMm,
            s.samples,
            s.feed,
            s.power,
            s.labelPower,
            stock.widthMm,
            stock.heightMm,
        ].every(Number.isFinite) ||
        !['ramp', 'sweep'].includes(s.mode) ||
        s.lengthMm < 20 ||
        s.lengthMm > 500 ||
        !Number.isInteger(s.samples) ||
        s.samples < 2 ||
        s.samples > 21 ||
        s.feed <= 0 ||
        s.feed > maxFeed ||
        s.power <= 0 ||
        s.power > 1000 ||
        s.labelPower <= 0 ||
        s.labelPower > 1000
    )
        throw new Error('Check focus-test length, samples, feed and power.');
    if (
        s.mode === 'ramp' &&
        (!Number.isFinite(s.leftGapMm) ||
            !Number.isFinite(s.rightGapMm) ||
            Math.min(s.leftGapMm, s.rightGapMm) <= 0 ||
            Math.max(s.leftGapMm, s.rightGapMm) > 10000 ||
            Math.abs(s.leftGapMm - s.rightGapMm) < 0.1)
    )
        throw new Error(
            'Enter two different measured head-to-material gaps for the ramp.',
        );
    if (s.mode === 'ramp' && s.lengthMm / (s.samples - 1) < 4)
        throw new Error(
            'Ramp marks need at least 4 mm spacing; reduce samples or increase length.',
        );
    if (
        s.mode === 'sweep' &&
        (![s.startZMm, s.endZMm].every(Number.isFinite) ||
            Math.abs(s.endZMm - s.startZMm) / (s.samples - 1) < 0.01)
    )
        throw new Error(
            'Set distinct start/end work Z values with at least 0.01 mm per sample.',
        );
    const width = s.lengthMm + 20,
        height = s.mode === 'ramp' ? 30 : s.samples * 8 + 12;
    if (stock.widthMm < width || stock.heightMm < height)
        throw new Error('Focus test does not fit the stock.');
    const bounds = jobStockBounds(stock),
        x = bounds.minX + 10,
        y = bounds.minY + 10;
    const paths: {
        points: { x: number; y: number; power: number }[];
        focusZMm?: number;
    }[] = [];
    const preview: ({ x: number; y: number }[] & {
        _laserVariablePower?: boolean;
        _laserPower?: number;
    })[] = [];
    const samples: { index: number; valueMm: number; positionMm: number }[] =
        [];
    let base: Record<string, unknown> = {};
    const append = (
        lines: { x: number; y: number }[][],
        power: number,
        z?: number,
        isLabel = false,
    ) => {
        const result = createLaserToolpath(
            lines.map((points) => ({ points })),
            makeToolpathConfig({
                operation: 'laser-cut',
                toolDiameter: 1,
                cutDepth: 1,
                laserFeed: s.feed,
                laserPower: power,
                laserOptions: {
                    passes: 1,
                    optimizeTravel: false,
                    innerFirst: false,
                    powerMode: options.powerMode ?? 'profile',
                    airAssist: options.airAssist ?? false,
                    perforation: isLabel && (s.labelPerforation ?? false),
                    perforationCut: s.labelCutMm ?? 0.1,
                    perforationSkip: s.labelSkipMm ?? 0.1,
                },
            }),
        );
        base = result;
        paths.push(
            ...result.laserPaths.map((path) =>
                z === undefined ? path : { ...path, focusZMm: z },
            ),
        );
        preview.push(...result.previewContours);
    };
    const label = (text: string, px: number, py: number, z?: number) =>
        append(
            createStrokeText(text, { x: px, y: py }, 2),
            s.labelPower,
            z,
            true,
        );
    if (s.mode === 'ramp') {
        append(
            [
                [
                    { x, y: y + 10 },
                    { x: x + s.lengthMm, y: y + 10 },
                ],
            ],
            s.power,
        );
        for (let i = 0; i < s.samples; i++) {
            const distance = (s.lengthMm * i) / (s.samples - 1),
                px = x + distance;
            append(
                [
                    [
                        { x: px, y: y + 7 },
                        { x: px, y: y + 9 },
                    ],
                ],
                s.power,
            );
            label(String(i + 1), px - 0.6, y + 3);
            samples.push({
                index: i + 1,
                positionMm: distance,
                valueMm:
                    s.leftGapMm +
                    ((s.rightGapMm - s.leftGapMm) * i) / (s.samples - 1),
            });
        }
    } else {
        const labelZ = (s.startZMm + s.endZMm) / 2;
        for (let i = 0; i < s.samples; i++) {
            const z =
                    s.startZMm +
                    ((s.endZMm - s.startZMm) * i) / (s.samples - 1),
                py = y + i * 8;
            append(
                [
                    [
                        { x, y: py + 4 },
                        { x: x + s.lengthMm, y: py + 4 },
                    ],
                ],
                s.power,
                z,
            );
            label(
                displayValue(z, units, units === 'metric' ? 3 : 4) +
                    ' ' +
                    lengthUnit(units),
                x,
                py,
                labelZ,
            );
            samples.push({ index: i + 1, positionMm: i * 8, valueMm: z });
        }
    }
    const focus = {
        mode: s.mode,
        stockBounds: bounds,
        ...(s.mode === 'sweep'
            ? {
                  controlledZ: s.controlledZ,
                  minZMm: s.minZMm,
                  maxZMm: s.maxZMm,
                  travelZMm: s.travelZMm,
                  zFeedMmMin: s.zFeedMmMin,
                  clearanceDirection: s.clearanceDirection,
                  stepMm: Math.abs(s.endZMm - s.startZMm) / (s.samples - 1),
              }
            : {}),
    };
    const path = {
        ...base,
        operation: 'laser-cut',
        label:
            s.mode === 'ramp' ? 'Manual focus ramp' : 'Motorized focus sweep',
        laserPaths: paths,
        previewContours: preview,
        laserFocusTest: focus,
    };
    validateLaserFocusTest(path);
    for (const p of paths)
        for (const point of p.points)
            if (
                point.x < bounds.minX - 1e-7 ||
                point.x > bounds.maxX + 1e-7 ||
                point.y < bounds.minY - 1e-7 ||
                point.y > bounds.maxY + 1e-7
            )
                throw new Error(
                    'Focus labels or lines extend outside the stock.',
                );
    return {
        path,
        samples,
        frame: [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.minX + width, y: bounds.minY },
            { x: bounds.minX + width, y: bounds.minY + height },
            { x: bounds.minX, y: bounds.minY + height },
        ],
    };
}
