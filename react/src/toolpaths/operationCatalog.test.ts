import { operationsForSelection } from './operationCatalog';

const values = (selection: Parameters<typeof operationsForSelection>[0]) =>
    operationsForSelection(selection).map(({ value }) => value);

test('shows 3D machining only for a selected 3D model and its outside release', () => {
    const operations = values({
        hasBitmap: true,
        hasVector: false,
        hasSurfaceModel: true,
        surfaceModelSelectedAlone: true,
    });
    expect(operations).toEqual([
        'profile-outside',
        'surface-clear',
        'surface-finish',
        'surface-waterline',
    ]);
});

test('vector selections, including mixed selections resolved to vectors, never offer 3D machining', () => {
    const operations = values({
        hasBitmap: false,
        hasVector: true,
        hasSurfaceModel: false,
        surfaceModelSelectedAlone: false,
    });
    expect(operations).not.toContain('surface-clear');
    expect(operations).not.toContain('surface-finish');
    expect(operations).not.toContain('surface-waterline');
    expect(operations).toContain('profile-outside');
});

test('raster images retain raster-only operations', () => {
    const operations = values({
        hasBitmap: true,
        hasVector: false,
        hasSurfaceModel: false,
        surfaceModelSelectedAlone: false,
    });
    expect(operations).toContain('laser-raster');
    expect(operations).not.toContain('surface-clear');
    expect(operations).not.toContain('profile-outside');
});

test('does not offer group operations when multiple 3D models are selected', () => {
    expect(
        values({
            hasBitmap: true,
            hasVector: false,
            hasSurfaceModel: true,
            surfaceModelSelectedAlone: false,
        }),
    ).toEqual([]);
});

test('workspace operations stay separate for vectors and bitmaps', () => {
    const selection = {
        hasBitmap: false,
        hasVector: true,
        hasSurfaceModel: false,
        surfaceModelSelectedAlone: false,
    };
    expect(values({ ...selection, workspace: 'laser' })).toEqual([
        'laser-fill',
        'laser-cut',
    ]);
    expect(values({ ...selection, workspace: 'milling' })).not.toContain(
        'laser-cut',
    );
    expect(
        values({
            ...selection,
            hasBitmap: true,
            hasVector: false,
            workspace: 'laser',
        }),
    ).toEqual(['laser-raster']);
    expect(
        values({
            ...selection,
            hasBitmap: true,
            hasVector: false,
            workspace: 'milling',
        }),
    ).toEqual(['wavy-raster', 'halftone']);
});

test('laser mixed image and shape selection can choose a masked raster without changing milling', () => {
    const mixed = {
        hasBitmap: true,
        hasVector: true,
        hasSurfaceModel: false,
        surfaceModelSelectedAlone: false,
    };
    expect(values({ ...mixed, workspace: 'laser' })).toEqual([
        'laser-fill',
        'laser-cut',
        'laser-raster',
    ]);
    expect(values({ ...mixed, workspace: 'milling' })).not.toContain(
        'laser-raster',
    );
});
