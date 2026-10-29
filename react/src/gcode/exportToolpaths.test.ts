import { exportToolpaths } from './exportToolpaths';
import { controllerPreset } from './profiles';

function path(toolNumber = 1) {
    return {
        operation: 'profile-outside',
        operationLabel: 'Profile',
        label: `Tool ${toolNumber}`,
        safeZ: 5,
        feedRate: 600,
        plungeRate: 100,
        spindle: 12000,
        toolNumber,
        toolDiameter: 3,
        cutDepth: 1,
        passDepth: 1,
        passDepths: [-1],
        previewContours: [
            [
                { x: 0, y: 0 },
                { x: 25.4, y: 0 },
            ],
        ],
        tabs: [],
        tabHeight: 0,
    };
}
test('real CAM exports use operation-specific variables, units and controller commands', () => {
    const settings = controllerPreset('duet');
    settings.blocks.operationStart = '(Begin T{toolNumber} {operationName})';
    const code = exportToolpaths(
        [path(1), path(2)],
        'job',
        false,
        'imperial',
        settings,
    );
    expect(code).toContain('G20');
    expect(code).toContain('M3 P0 S12000');
    expect(code).toContain('; Begin T2 Profile');
    expect(code).toContain('X1 Y0');
    expect(code).not.toMatch(/M6|M30/);
});
test('single-tool fallback succeeds when Grbl cannot export the combined tool change', () => {
    const settings = controllerPreset('grbl');
    expect(() =>
        exportToolpaths([path(1), path(2)], 'job', true, 'metric', settings),
    ).toThrow('individual');
    expect(
        exportToolpaths([path(2)], 'job', true, 'metric', settings),
    ).toContain('M3 S12000');
});
