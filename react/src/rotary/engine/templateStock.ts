import { clonePoints, sampleProfile } from './profileModel';
import { defaultFixtureSettings, fixtureXClearance } from './fixtureClearance';
import { ROTARY_MAX_DIAMETER, rotaryMaxLength } from './stockLimits';
import type { ProfilePoint, RotaryStock, RotaryToolpathEntry } from './types';

export function fitTemplateStock(
    points: ProfilePoint[],
    stock: RotaryStock,
    entries: Pick<RotaryToolpathEntry, 'tool' | 'ops'>[],
) {
    const margins = entries.map(({ tool, ops }) => {
        const settings = ops.mesh ?? defaultFixtureSettings;
        return {
            chuck: fixtureXClearance(tool, settings),
            tail: settings.tailClearance + fixtureXClearance(tool, settings),
        };
    });
    const minX = Math.min(...points.map((point) => point.x));
    const shift = Math.max(
        0,
        Math.ceil(
            stock.grip +
                Math.max(...margins.map((margin) => margin.chuck)) +
                0.001 -
                minX,
        ),
    );
    const fitted = clonePoints(points);
    for (const point of fitted) {
        point.x += shift;
        point.h1.x += shift;
        point.h2.x += shift;
    }
    const samples = sampleProfile(fitted, 16, 0.005);
    const length =
        Math.ceil(
            (Math.max(...samples.map((point) => point.x)) +
                Math.max(...margins.map((margin) => margin.tail)) +
                0.001) /
                5,
        ) * 5;
    const diameter = Math.ceil(
        Math.max(
            2 * Math.max(...samples.map((point) => point.r)) + 2,
            stock.supports?.enabled ? stock.supports.endDiameter : 0,
        ),
    );
    if (
        !Number.isFinite(length) ||
        !Number.isFinite(diameter) ||
        length > rotaryMaxLength(stock.ext) ||
        diameter > ROTARY_MAX_DIAMETER
    )
        throw new Error(
            'This template and cutter clearance do not fit the selected machine capacity.',
        );
    return { points: fitted, stock: { ...stock, length, diameter } };
}
