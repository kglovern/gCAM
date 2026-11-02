import {
    captureImagePreset,
    imagePresetFields,
    type ImagePresetField,
    exportImagePresets,
    importImagePresets,
    loadImagePresets,
    saveImagePresets,
} from './image-presets';
const preset = captureImagePreset('photo', 'Photo', 1.4, {
    imageMode: 'halftone',
    brightness: 0.2,
    halftoneCellSize: 2,
    passes: 3,
    kerf: 0.1,
    dotWidthCorrection: 0.05,
    scanAlignment: { enabled: false, measurements: [] },
    imageCrop: { left: 0.1, bottom: 0, right: 1, top: 1 },
});
test('captures only image settings, preserving gamma without hardware/job values', () => {
    expect(preset).toEqual({
        id: 'photo',
        name: 'Photo',
        gamma: 1.4,
        options: {
            imageMode: 'halftone',
            brightness: 0.2,
            halftoneCellSize: 2,
        },
    });
});
test('round-trips portable presets and repeated imports keep existing IDs', () => {
    const text = exportImagePresets([preset]);
    expect(importImagePresets(text, [])).toEqual([preset]);
    const local = { ...preset, gamma: 2 };
    expect(importImagePresets(text, [local])).toEqual([local]);
    localStorage.clear();
    saveImagePresets([local]);
    expect(loadImagePresets()).toEqual([local]);
});
test.each([
    { gamma: 0 },
    { gamma: null },
    { options: { passes: 10 } },
    { options: { imageCrop: {} } },
    { options: { edgeGain: -1 } },
    { name: ' ' },
])('rejects invalid or out-of-scope imported values %p', (change) => {
    const text = JSON.stringify({
        format: 'gcam-image-presets',
        version: 1,
        presets: [{ ...preset, ...change }],
    });
    saveImagePresets([preset]);
    expect(() => importImagePresets(text, [])).toThrow();
    expect(loadImagePresets()).toEqual([preset]);
});
test('rejects unknown versions and duplicate IDs atomically', () => {
    expect(() =>
        importImagePresets(
            JSON.stringify({
                format: 'gcam-image-presets',
                version: 3,
                presets: [],
            }),
            [],
        ),
    ).toThrow();
    expect(() =>
        importImagePresets(
            JSON.stringify({
                format: 'gcam-image-presets',
                version: 1,
                presets: [preset, preset],
            }),
            [],
        ),
    ).toThrow(/Duplicate/);
});

test('selected settings exclude Gamma, DPI and unrelated image fields', () => {
    const partial = captureImagePreset(
        'contrast',
        'Contrast only',
        2,
        {
            contrast: 1.7,
            imageMode: 'edge',
            imageCrop: { left: 0, bottom: 0, right: 1, top: 1 },
        },
        { fields: ['contrast'], interval: 0.2 },
    );
    expect(partial).toEqual({
        id: 'contrast',
        name: 'Contrast only',
        options: { contrast: 1.7 },
    });
    expect(imagePresetFields(partial)).toEqual(['contrast']);
    const text = exportImagePresets([partial]);
    expect(JSON.parse(text).version).toBe(2);
    expect(importImagePresets(text, [])).toEqual([partial]);
});
test('Gamma-only presets remain readable as version 1 while DPI uses version 2', () => {
    const gamma = captureImagePreset(
        'gamma',
        'Gamma only',
        1.7,
        {},
        { fields: ['gamma'], interval: 0.2 },
    );
    expect(gamma).toEqual({
        id: 'gamma',
        name: 'Gamma only',
        gamma: 1.7,
        options: {},
    });
    expect(JSON.parse(exportImagePresets([gamma])).version).toBe(1);
    const dpi = captureImagePreset(
        'dpi',
        'DPI only',
        2,
        {},
        { fields: ['interval'], interval: 0.125 },
    );
    expect(dpi).toEqual({
        id: 'dpi',
        name: 'DPI only',
        interval: 0.125,
        options: {},
    });
    expect(imagePresetFields(dpi)).toEqual(['interval']);
    const text = exportImagePresets([gamma, dpi]);
    expect(JSON.parse(text).version).toBe(2);
    expect(importImagePresets(text, [])).toEqual([gamma, dpi]);
});
test('explicitly selected defaults include zero and false without capturing job settings', () => {
    const p = captureImagePreset(
        'defaults',
        'Defaults',
        1,
        { passes: 9, laserPower: 400 } as Parameters<
            typeof captureImagePreset
        >[3],
        {
            fields: ['brightness', 'contrast', 'invert', 'shadeCount'],
            interval: 0.2,
        },
    );
    expect(p.options).toEqual({
        brightness: 0,
        contrast: 1,
        invert: false,
        shadeCount: 0,
    });
    expect(p.gamma).toBeUndefined();
});
test('no-op, unknown and repeated field selections are rejected', () => {
    for (const fields of [[], ['gamma', 'gamma'], ['feed' as ImagePresetField]])
        expect(() =>
            captureImagePreset(
                'bad',
                'Bad',
                1,
                {},
                { fields: fields as ImagePresetField[], interval: 0.2 },
            ),
        ).toThrow();
});
test.each([0, NaN, -0.1])(
    'invalid captured scan interval is rejected %p',
    (interval) => {
        expect(() =>
            captureImagePreset(
                'bad',
                'Bad',
                1,
                {},
                { fields: ['interval'], interval },
            ),
        ).toThrow();
    },
);
test('version 1 cannot silently carry Gamma exclusions or a new interval', () => {
    for (const p of [
        { id: 'a', name: 'A', options: { contrast: 2 } },
        { id: 'a', name: 'A', gamma: 1, interval: 0.1, options: {} },
    ])
        expect(() =>
            importImagePresets(
                JSON.stringify({
                    format: 'gcam-image-presets',
                    version: 1,
                    presets: [p],
                }),
                [],
            ),
        ).toThrow('version 1');
});
test('legacy local presets migrate on save without overwriting the old library', () => {
    localStorage.clear();
    const legacy = JSON.stringify([preset]);
    localStorage.setItem('gcam.laserImagePresets.v1', legacy);
    expect(loadImagePresets()).toEqual([preset]);
    const partial = captureImagePreset(
        'contrast',
        'Contrast',
        1,
        { contrast: 2 },
        { fields: ['contrast'], interval: 0.1 },
    );
    saveImagePresets([preset, partial]);
    expect(loadImagePresets()).toEqual([preset, partial]);
    expect(localStorage.getItem('gcam.laserImagePresets.v1')).toBe(legacy);
    saveImagePresets([]);
    expect(loadImagePresets()).toEqual([]);
});

test('selected undefined defaults are captured and unselected invalid Gamma is ignored', () => {
    const p = captureImagePreset(
        'defaults',
        'Defaults',
        NaN,
        { contrast: undefined },
        { fields: ['contrast'], interval: NaN },
    );
    expect(p.options).toEqual({ contrast: 1 });
    expect(p.gamma).toBeUndefined();
});
test('selected missing Gamma is rejected even alongside valid options', () => {
    expect(() =>
        captureImagePreset(
            'bad',
            'Bad',
            undefined as unknown as number,
            { contrast: 2 },
            { fields: ['gamma', 'contrast'], interval: 0.1 },
        ),
    ).toThrow('Invalid image preset');
});

test('enhancement controls use the new preset version and retain selected settings', () => {
    const p = captureImagePreset(
        'enhance',
        'Enhance',
        1,
        { filterRadius: 5, sharpeningDenoise: 0.04 },
        { fields: ['filterRadius', 'sharpeningDenoise'], interval: 0.1 },
    );
    expect(p.options).toEqual({ filterRadius: 5, sharpeningDenoise: 0.04 });
    const text = exportImagePresets([p]);
    expect(JSON.parse(text).version).toBe(2);
    expect(importImagePresets(text, [])).toEqual([p]);
});
