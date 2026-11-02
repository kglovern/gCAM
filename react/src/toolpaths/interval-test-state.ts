import type { IntervalTestSettings } from './interval-test';

export interface IntervalTestState {
    settings: IntervalTestSettings;
    lastResult: {
        intervalMm: number;
        settings: IntervalTestSettings;
        material: string;
        thicknessMm: number;
        recordedAt: string;
    } | null;
}
const key = (device: string) =>
    'gcam.laserInterval.v1.' + encodeURIComponent(device);
function validSettings(value: unknown): value is IntervalTestSettings {
    if (!value || typeof value !== 'object') return false;
    const s = value as IntervalTestSettings;
    return (
        [
            s.min,
            s.max,
            s.steps,
            s.size,
            s.feed,
            s.power,
            s.labelPower,
            s.overscan,
        ].every(Number.isFinite) &&
        s.min >= 0.02 &&
        s.max <= 1 &&
        s.max > s.min &&
        Number.isInteger(s.steps) &&
        s.steps >= 2 &&
        s.steps <= 12 &&
        s.size >= 8 &&
        s.size <= 20 &&
        s.feed > 0 &&
        s.power > 0 &&
        s.power <= 1000 &&
        s.labelPower > 0 &&
        s.labelPower <= 1000 &&
        s.overscan >= 0 &&
        s.overscan <= 20 &&
        ['solid', 'dither'].includes(s.pattern)
    );
}
function validResult(
    value: unknown,
): value is NonNullable<IntervalTestState['lastResult']> {
    if (!value || typeof value !== 'object') return false;
    const r = value as NonNullable<IntervalTestState['lastResult']>;
    if (
        !validSettings(r.settings) ||
        !Number.isFinite(r.intervalMm) ||
        typeof r.material !== 'string' ||
        r.material.length > 80 ||
        !Number.isFinite(r.thicknessMm) ||
        r.thicknessMm <= 0 ||
        typeof r.recordedAt !== 'string' ||
        !Number.isFinite(Date.parse(r.recordedAt))
    )
        return false;
    const index =
        ((r.intervalMm - r.settings.min) * (r.settings.steps - 1)) /
        (r.settings.max - r.settings.min);
    return (
        index >= -1e-8 &&
        index <= r.settings.steps - 1 + 1e-8 &&
        Math.abs(index - Math.round(index)) < 1e-8
    );
}
export function loadIntervalTest(
    device: string,
    defaults: IntervalTestSettings,
): IntervalTestState {
    try {
        const text = localStorage.getItem(key(device));
        if (!text || text.length > 16000)
            throw new Error('Missing interval preferences.');
        const raw = JSON.parse(text);
        if (raw.version !== 1 || !validSettings(raw.settings))
            throw new Error('Invalid interval preferences.');
        return {
            settings: raw.settings,
            lastResult: validResult(raw.lastResult) ? raw.lastResult : null,
        };
    } catch {
        return { settings: defaults, lastResult: null };
    }
}
export function saveIntervalTest(device: string, state: IntervalTestState) {
    if (
        !validSettings(state.settings) ||
        (state.lastResult !== null && !validResult(state.lastResult))
    )
        throw new Error('Invalid interval settings or result.');
    const text = JSON.stringify({ version: 1, ...state });
    if (text.length > 16000)
        throw new Error('Interval preferences exceed the storage limit.');
    localStorage.setItem(key(device), text);
}
