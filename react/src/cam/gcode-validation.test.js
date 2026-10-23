/**
 * Tests: rejects unsafe machine values before G-code emission; keeps V-bit and tab constraints together with emission validation.
 */
import { validateToolpaths } from './gcode-validation.js';
import { buildPassDepths } from './operations/contract.js';

const valid = {
    operation: 'profile-outside',
    label: 'Profile',
    safeZ: 5,
    feedRate: 1000,
    plungeRate: 300,
    spindle: 18000,
    toolDiameter: 6,
    cutDepth: 3,
    passDepth: 3,
    tabHeight: 0,
    tabs: [],
};

test('rejects unsafe machine values before G-code emission', () => {
    expect(() => validateToolpaths([{ ...valid, safeZ: 0 }])).toThrow(
        'Z Safe must be greater than zero',
    );
    expect(() => validateToolpaths([{ ...valid, passDepth: 0 }])).toThrow(
        'Pass depth must be greater than zero',
    );
});

test('a shallow pocket uses one final-depth pass when the suggested pass limit is larger', () => {
    expect(() =>
        validateToolpaths([
            { ...valid, operation: 'pocket', cutDepth: 2, passDepth: 3 },
        ]),
    ).not.toThrow();
    expect(buildPassDepths(2, 3)).toEqual([-2]);
});

test('keeps V-bit and tab constraints together with emission validation', () => {
    expect(() =>
        validateToolpaths([
            { ...valid, operation: 'texture-fill', cutterAngle: 180 },
        ]),
    ).toThrow('V-bit angle must be between 1 and 179 degrees');
    expect(() =>
        validateToolpaths([
            { ...valid, tabs: [{ contourIndex: 0, along: 5 }], tabWidth: 2 },
        ]),
    ).toThrow('Tab width must be between 3 and 50 mm');
});

test('requires tool-library cutter types to match 3D surface strategy', () => {
    const surface = {
        ...valid,
        operation: 'surface-clear',
        toolNumber: 1,
        libraryToolId: 'catalog:flat-6mm',
    };
    expect(() =>
        validateToolpaths([{ ...surface, cutterType: 'ball' }]),
    ).toThrow('flat endmill');
    expect(() =>
        validateToolpaths([{ ...surface, cutterType: 'flat' }]),
    ).not.toThrow();
    expect(() =>
        validateToolpaths([
            { ...surface, operation: 'surface-finish', cutterType: 'flat' },
        ]),
    ).toThrow('ball-nose endmill');
    expect(() =>
        validateToolpaths([
            { ...surface, operation: 'surface-finish', cutterType: 'ballnose' },
        ]),
    ).not.toThrow();
    expect(() =>
        validateToolpaths([
            { ...surface, operation: 'surface-waterline', cutterType: 'flat' },
        ]),
    ).toThrow('ball-nose endmill');
    expect(() =>
        validateToolpaths([
            { ...surface, operation: 'surface-waterline', cutterType: 'ball' },
        ]),
    ).not.toThrow();
    expect(() =>
        validateToolpaths([
            { ...surface, cutterType: 'flat', libraryToolId: null },
        ]),
    ).toThrow('from the tool library');
});
