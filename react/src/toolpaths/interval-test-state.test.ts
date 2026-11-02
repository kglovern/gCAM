import { loadIntervalTest, saveIntervalTest } from './interval-test-state';
import type { IntervalTestSettings } from './interval-test';
const defaults: IntervalTestSettings = {
    min: 0.08,
    max: 0.16,
    steps: 5,
    size: 10,
    feed: 1200,
    power: 250,
    labelPower: 50,
    overscan: 2,
    pattern: 'solid',
};
beforeEach(() => localStorage.clear());
test('preferences and result snapshots remain scoped to the machine and lens', () => {
    const lastResult = {
        intervalMm: 0.12,
        settings: { ...defaults },
        material: 'plywood',
        thicknessMm: 3,
        recordedAt: '2026-11-01T10:00:00Z',
    };
    saveIntervalTest('machine|diode:10:G2', { settings: defaults, lastResult });
    expect(
        loadIntervalTest('machine|diode:10:G2', defaults).lastResult,
    ).toEqual(lastResult);
    expect(
        loadIntervalTest('machine|diode:10:G8', defaults).lastResult,
    ).toBeNull();
    expect(
        loadIntervalTest('other|diode:10:G2', defaults).lastResult,
    ).toBeNull();
    saveIntervalTest('machine|diode:10:G2', {
        settings: { ...defaults, feed: 1500 },
        lastResult,
    });
    expect(
        loadIntervalTest('machine|diode:10:G2', defaults).settings.feed,
    ).toBe(1500);
    expect(
        loadIntervalTest('machine|diode:10:G2', defaults).lastResult?.settings
            .feed,
    ).toBe(1200);
});
test.each([
    '{',
    '{"version":2}',
    JSON.stringify({ version: 1, settings: { ...defaults, power: -1 } }),
    'x'.repeat(16001),
])('invalid stored preferences fall back without applying a result', (raw) => {
    localStorage.setItem('gcam.laserInterval.v1.device', raw);
    expect(loadIntervalTest('device', defaults)).toEqual({
        settings: defaults,
        lastResult: null,
    });
});
test('non-sample selections are rejected while valid preferences survive an invalid saved result', () => {
    const lastResult = {
        intervalMm: 0.123,
        settings: defaults,
        material: 'plywood',
        thicknessMm: 3,
        recordedAt: '2026-11-01T10:00:00Z',
    };
    expect(() =>
        saveIntervalTest('device', { settings: defaults, lastResult }),
    ).toThrow('Invalid');
    localStorage.setItem(
        'gcam.laserInterval.v1.device',
        JSON.stringify({ version: 1, settings: defaults, lastResult }),
    );
    expect(loadIntervalTest('device', defaults)).toEqual({
        settings: defaults,
        lastResult: null,
    });
});
