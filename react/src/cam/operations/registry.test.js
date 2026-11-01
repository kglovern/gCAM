/**
 * Tests: every public CAM operation is represented by a registry contract; registry is the source of operation labels and rejects unknown IDs.
 */
import {
    getOperation,
    getOperationLabel,
    getToolpathEmission,
    operationRegistry,
} from './registry.js';

test('every public CAM operation is represented by a registry contract', () => {
    expect([...operationRegistry.keys()]).toEqual([
        'laser-fill',
        'profile-outside',
        'profile-inside',
        'pocket',
        'engrave',
        'chamfer',
        'vcarve',
        'countersink',
        'texture-fill',
        'laser-cut',
        'laser-raster',
        'wavy-raster',
        'halftone',
    ]);
    for (const operation of operationRegistry.values()) {
        expect(operation.id).toBeTruthy();
        expect(typeof operation.createPreview).toBe('function');
        expect(operation.emission).toBeTruthy();
    }
});

test('registry is the source of operation labels and rejects unknown IDs', () => {
    expect(getOperationLabel('texture-fill')).toBe('Texture Fill');
    expect(getOperation('profile-outside').emission).toBe('contours');
    expect(getToolpathEmission({ operation: 'halftone' })).toBe('halftone');
    expect(
        getToolpathEmission({ operation: 'pocket', emission: 'contours' }),
    ).toBe('contours');
    expect(() => getOperation('unknown-operation')).toThrow(
        'Unsupported CAM operation',
    );
});
