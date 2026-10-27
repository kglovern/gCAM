/** Tests: rotary project-slice validation for .gcam.json files. */
import { isRotaryProjectSlice } from './types';

const good = {
    name: 'leg',
    mode: 'profile',
    pommels: [{ x0: 20, x1: 35, w: 30 }],
    points: [
        {
            x: 20,
            r: 11,
            type: 'corner',
            h1: { x: 20, r: 11 },
            h2: { x: 20, r: 11 },
        },
    ],
    stock: { length: 90, diameter: 25.4, grip: 19, ext: false },
    tool: {
        type: 'ball',
        dia: 6.35,
        spindle: 16000,
        feed: 1270,
        plunge: 381,
        slotNum: null,
    },
    ops: {
        face: true,
        rough: true,
        allow: 0.8,
        roughStep: 2,
        finish: true,
        raster: 270,
        groove: { on: false, x: 55, w: 3 },
        part: { on: false, x: 80 },
    },
};

test('accepts a well-formed rotary slice', () => {
    expect(isRotaryProjectSlice(good)).toBe(true);
    expect(isRotaryProjectSlice({ ...good, stlKey: 'q:123' })).toBe(true);
});

test('rejects malformed slices', () => {
    expect(isRotaryProjectSlice(null)).toBe(false);
    expect(isRotaryProjectSlice({})).toBe(false);
    expect(isRotaryProjectSlice({ ...good, mode: 'lathe' })).toBe(false);
    expect(isRotaryProjectSlice({ ...good, points: 'nope' })).toBe(false);
    expect(isRotaryProjectSlice({ ...good, stock: null })).toBe(false);
    expect(isRotaryProjectSlice({ ...good, stlKey: 42 })).toBe(false);
});

test('validates optional draft restoration fields without rejecting legacy projects', () => {
    expect(
        isRotaryProjectSlice({
            ...good,
            operation: 'finish',
            toolpathEditorOpen: true,
            editingToolpathId: null,
        }),
    ).toBe(true);
    expect(isRotaryProjectSlice({ ...good, operation: 'mystery' })).toBe(false);
    expect(isRotaryProjectSlice({ ...good, toolpathEditorOpen: 'yes' })).toBe(
        false,
    );
    expect(isRotaryProjectSlice({ ...good, editingToolpathId: 3 })).toBe(false);
});
