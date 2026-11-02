import { focusTestDefaults, type FocusTestSettings } from './focus-test';
import type { JobStock } from '../job/stock';

export interface FocusResult {
    mode: 'ramp' | 'sweep';
    index: number;
    valueMm: number;
    recordedAt: string;
    settings: FocusTestSettings;
    stock: Pick<JobStock, 'widthMm' | 'heightMm' | 'thicknessMm' | 'origin'>;
}
export interface FocusTestState {
    settings: FocusTestSettings;
    lastResult: FocusResult | null;
}
const key = (device: string) =>
    'gcam.laserFocus.v1.' + encodeURIComponent(device);
function settings(value: unknown): value is FocusTestSettings {
    if (!value || typeof value !== 'object') return false;
    const raw = value as FocusTestSettings,
        defaults = focusTestDefaults(1, 1);
    return Object.keys(defaults).every((k) => {
        if (
            ['labelPerforation', 'labelCutMm', 'labelSkipMm'].includes(k) &&
            raw[k as keyof FocusTestSettings] === undefined
        )
            return true;
        if (k === 'labelPerforation')
            return typeof raw.labelPerforation === 'boolean';
        if (k === 'mode') return ['ramp', 'sweep'].includes(raw.mode);
        if (k === 'controlledZ') return typeof raw.controlledZ === 'boolean';
        if (k === 'clearanceDirection')
            return [1, -1].includes(raw.clearanceDirection);
        return (
            typeof raw[k as keyof FocusTestSettings] === 'number' &&
            Number.isFinite(raw[k as keyof FocusTestSettings])
        );
    });
}
function result(value: unknown): value is FocusResult {
    if (!value || typeof value !== 'object') return false;
    const raw = value as FocusResult;
    return (
        ['ramp', 'sweep'].includes(raw.mode) &&
        Number.isInteger(raw.index) &&
        raw.index >= 1 &&
        raw.index <= 21 &&
        Number.isFinite(raw.valueMm) &&
        typeof raw.recordedAt === 'string' &&
        Number.isFinite(Date.parse(raw.recordedAt)) &&
        settings(raw.settings) &&
        raw.settings.mode === raw.mode &&
        !!raw.stock &&
        [raw.stock.widthMm, raw.stock.heightMm, raw.stock.thicknessMm].every(
            (v) => Number.isFinite(v) && v > 0,
        ) &&
        ['front-left', 'center'].includes(raw.stock.origin ?? 'front-left')
    );
}
export function loadFocusTest(
    device: string,
    defaults: FocusTestSettings,
): FocusTestState {
    try {
        const text = localStorage.getItem(key(device));
        if (!text || text.length > 16000)
            return { settings: defaults, lastResult: null };
        const raw = JSON.parse(text);
        if (raw.version !== 1 || !settings(raw.settings))
            throw new Error('Invalid focus settings.');
        return {
            settings: { ...defaults, ...raw.settings },
            lastResult: result(raw.lastResult) ? raw.lastResult : null,
        };
    } catch {
        return { settings: defaults, lastResult: null };
    }
}
export function saveFocusTest(device: string, value: FocusTestState) {
    if (
        !settings(value.settings) ||
        (value.lastResult !== null && !result(value.lastResult))
    )
        throw new Error('Invalid focus test preferences or result.');
    const text = JSON.stringify({ version: 1, ...value });
    if (text.length > 16000)
        throw new Error('Focus preferences exceed the storage limit.');
    localStorage.setItem(key(device), text);
}
