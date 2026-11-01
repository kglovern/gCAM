import { loadFocusTest, saveFocusTest } from './focus-test-state';
import { focusTestDefaults } from './focus-test';

const defaults = focusTestDefaults(1200, 50);
beforeEach(() => localStorage.clear());
test('older focus preferences retain measured gaps and gain disabled label perforation', () => {
    const { labelPerforation, labelCutMm, labelSkipMm, ...old } = {
        ...defaults,
        leftGapMm: 10,
        rightGapMm: 18,
    };
    localStorage.setItem(
        'gcam.laserFocus.v1.device',
        JSON.stringify({ version: 1, settings: old, lastResult: null }),
    );
    expect(loadFocusTest('device', defaults).settings).toEqual({
        ...defaults,
        ...old,
    });
    expect(loadFocusTest('device', defaults).settings.labelPerforation).toBe(
        false,
    );
});

test('focus preferences and measured results belong to one machine and lens setup', () => {
    const settings = { ...defaults, leftGapMm: 10, rightGapMm: 18 };
    const lastResult = {
        mode: 'ramp' as const,
        index: 5,
        valueMm: 14,
        recordedAt: '2026-11-01T10:00:00Z',
        settings,
        stock: {
            widthMm: 200,
            heightMm: 100,
            thicknessMm: 3,
            origin: 'center' as const,
        },
    };
    saveFocusTest('machine|diode:10:G2', { settings, lastResult });
    expect(loadFocusTest('machine|diode:10:G2', defaults)).toEqual({
        settings,
        lastResult,
    });
    expect(loadFocusTest('machine|diode:10:G8', defaults)).toEqual({
        settings: defaults,
        lastResult: null,
    });
    expect(loadFocusTest('other|diode:10:G2', defaults).lastResult).toBeNull();
    const next = { ...settings, leftGapMm: 12 };
    saveFocusTest('machine|diode:10:G2', { settings: next, lastResult });
    const loaded = loadFocusTest('machine|diode:10:G2', defaults);
    expect(loaded.settings.leftGapMm).toBe(12);
    expect(loaded.lastResult?.settings.leftGapMm).toBe(10);
    expect(loaded.lastResult?.stock.origin).toBe('center');
});

test.each([
    '{',
    '{"version":2}',
    JSON.stringify({ version: 1, settings: { ...defaults, feed: null } }),
    'x'.repeat(16001),
])(
    'malformed or unsupported saved focus preferences fall back safely',
    (raw) => {
        localStorage.setItem('gcam.laserFocus.v1.device', raw);
        expect(loadFocusTest('device', defaults)).toEqual({
            settings: defaults,
            lastResult: null,
        });
    },
);

test('invalid measured result does not discard valid preferences', () => {
    localStorage.setItem(
        'gcam.laserFocus.v1.device',
        JSON.stringify({
            version: 1,
            settings: defaults,
            lastResult: { index: 99 },
        }),
    );
    expect(loadFocusTest('device', defaults)).toEqual({
        settings: defaults,
        lastResult: null,
    });
    expect(() =>
        saveFocusTest('device', {
            settings: { ...defaults, feed: Infinity },
            lastResult: null,
        }),
    ).toThrow('Invalid');
});
