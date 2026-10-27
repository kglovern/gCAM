/** Tests for toolpath contour and depth pass ordering in GRBL output. */
import { buildGcode } from './program.js';

function makeToolpath(operation) {
    return {
        operation,
        label: 'two holes',
        operationLabel: operation,
        safeZ: 5,
        feedRate: 100,
        plungeRate: 50,
        spindle: 1000,
        toolNumber: 1,
        toolDiameter: 3,
        cutDepth: 6,
        passDepth: 2,
        passDepths: [-2, -4, -6],
        previewContours: [
            [
                { x: 10, y: 0 },
                { x: 11, y: 0 },
                { x: 11, y: 1 },
                { x: 10, y: 1 },
                { x: 10, y: 0 },
            ],
            [
                { x: 30, y: 0 },
                { x: 31, y: 0 },
                { x: 31, y: 1 },
                { x: 30, y: 1 },
                { x: 30, y: 0 },
            ],
        ],
        tabs: [],
        tabHeight: 0,
        trochoidEnabled: false,
    };
}

function plungeSequence(operation) {
    const lines = buildGcode({
        toolpaths: [makeToolpath(operation)],
        forcePolylineArcs: true,
    }).split('\n');
    let currentRapidStart = '';
    const sequence = [];
    for (const line of lines) {
        if (line.startsWith('G0 X')) currentRapidStart = line;
        if (/^G1 Z-/.test(line)) sequence.push([currentRapidStart, line]);
    }
    return sequence;
}

test('inside and outside profiles finish each contour through all depths', () => {
    const expected = [10, 30].flatMap((x) =>
        [-2, -4, -6].map((depth) => [`G0 X${x} Y0`, `G1 Z${depth} F50`]),
    );

    expect(plungeSequence('profile-inside')).toEqual(expected);
    expect(plungeSequence('profile-outside')).toEqual(expected);
});

test('pocket passes remain depth-first across the clearing contours', () => {
    expect(plungeSequence('pocket')).toEqual(
        [-2, -4, -6].flatMap((depth) =>
            [10, 30].map((x) => [`G0 X${x} Y0`, `G1 Z${depth} F50`]),
        ),
    );
});

test('helical contour entry descends on the compensated path before its finish lap', () => {
    const toolpath = makeToolpath('profile-inside');
    toolpath.previewContours = [
        [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 0, y: 20 },
            { x: 0, y: 0 },
        ],
    ];
    toolpath.passDepths = [-2];
    toolpath.helicalEntryEnabled = true;
    const gcode = buildGcode({
        toolpaths: [toolpath],
        forcePolylineArcs: true,
    });
    expect(gcode).toContain('G1 X20 Y0 Z-');
    expect(gcode).toContain('G1 X0 Y0 Z-2');
    expect(gcode).not.toContain('G1 Z-2');
});

function toolChangeLine(overrides) {
    const toolpath = { ...makeToolpath('pocket'), ...overrides };
    return buildGcode({ toolpaths: [toolpath], forcePolylineArcs: true })
        .split('\n')
        .filter((line) => /\bM6\b/.test(line));
}

test('tool change puts T and M6 on one line with the tool name and diameter', () => {
    expect(toolChangeLine({ libraryToolName: '1/4in Flat' })).toEqual([
        'T1 M6 (1/4in Flat - 3mm)',
    ]);
});

test('tool change falls back to the tool size when no name is selected', () => {
    expect(toolChangeLine({})).toEqual(['T1 M6 (3mm tool)']);
});

test('tool change comment strips parentheses from the tool name', () => {
    expect(toolChangeLine({ libraryToolName: 'Bit (6mm)' })).toEqual([
        'T1 M6 (Bit 6mm - 3mm)',
    ]);
});
