/**
 * Tests: importVectorFile parses a DXF square into fitted loops; importVectorFile rejects unsupported files.
 */
import { dxfUnitScaleToMm } from '../engine/dxf.js';
import { jest } from '@jest/globals';

const cxfTextStrokesMock = jest.fn(
    (
        text: string,
        _font: unknown,
        options: { x: number; y: number; height: number },
    ) => [
        [
            { x: options.x, y: options.y },
            { x: options.x + text.length * 6, y: options.y - options.height },
        ],
    ],
);
const parseCxfMock = jest.fn(() => ({
    name: 'CourierCad',
    letterSpacing: 3,
    wordSpacing: 6.75,
    lineSpacingFactor: 1,
    glyphs: new Map(),
}));
await jest.unstable_mockModule('../engine/cxf.js', () => ({
    cxfTextStrokes: cxfTextStrokesMock,
    parseCxf: parseCxfMock,
}));
const { importVectorFile, scaleImportResult, svgUnitScaleToMm } = await import(
    './import'
);

const SQUARE_DXF = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LWPOLYLINE',
    '8',
    '0',
    '90',
    '4',
    '70',
    '1',
    '10',
    '0.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '20.0',
    '10',
    '0.0',
    '20',
    '20.0',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
].join('\n');

test('importVectorFile parses a DXF square into fitted loops', async () => {
    const file = new File([SQUARE_DXF], 'square.dxf');
    const result = await importVectorFile(file);
    expect(result.entityCount).toBe(1);
    expect(result.loops.length).toBeGreaterThanOrEqual(1);
    expect(result.bounds?.maxX).toBeCloseTo(20);
    expect(result.unitScaleToMm).toBeNull();
});

test('imports DXF MTEXT as mixed-case CourierCad strokes', async () => {
    cxfTextStrokesMock.mockClear();
    parseCxfMock.mockClear();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
        ok: true,
        text: async () => 'CXF test font',
    })) as unknown as typeof fetch;
    const dxf = [
        '0',
        'SECTION',
        '2',
        'ENTITIES',
        '0',
        'MTEXT',
        '10',
        '10',
        '20',
        '20',
        '40',
        '10',
        '71',
        '1',
        '1',
        'Pocket the inner square',
        '0',
        'ENDSEC',
        '0',
        'EOF',
        '',
    ].join('\n');
    try {
        const result = await importVectorFile(new File([dxf], 'text.dxf'));
        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/assets/fonts/CourierCad.cxf',
        );
        expect(parseCxfMock).toHaveBeenCalledWith('CXF test font');
        expect(cxfTextStrokesMock).toHaveBeenCalledWith(
            'Pocket the inner square',
            expect.objectContaining({ name: 'CourierCad' }),
            expect.objectContaining({ height: 10 }),
        );
        expect(result.entityCount).toBe(1);
        expect(result.loops.length).toBeGreaterThan(0);
        expect(
            (result.bounds?.maxX ?? 0) - (result.bounds?.minX ?? 0),
        ).toBeGreaterThan(100);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test.each([
    [1, 25.4],
    [4, 1],
    [5, 10],
    [6, 1000],
])('reads DXF unit code %i as %f mm per unit', (code, expected) => {
    const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${code}\n0\nENDSEC\n`;
    expect(dxfUnitScaleToMm(dxf)).toBe(expected);
});

test('scales DXF geometry and bounds into millimetres', () => {
    const result = {
        fileName: 'part.dxf',
        entityCount: 1,
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 2, y: 1 },
                ],
            },
        ],
        bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 },
        unitScaleToMm: null,
        unitSource: 'unknown' as const,
    };
    expect(scaleImportResult(result, 25.4)).toMatchObject({
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 50.8, y: 25.4 },
                ],
            },
        ],
        bounds: { maxX: 50.8, maxY: 25.4 },
        unitScaleToMm: 25.4,
    });
});

test('converts SVG physical dimensions and defaults unitless SVGs to CSS pixels', () => {
    expect(svgUnitScaleToMm('<svg width="2in" viewBox="0 0 192 96"/>')).toEqual(
        {
            scale: 25.4 / 96,
            source: 'svg-physical-size',
        },
    );
    expect(
        svgUnitScaleToMm('<svg height="25.4mm" viewBox="0 0 96 96"/>'),
    ).toEqual({
        scale: 25.4 / 96,
        source: 'svg-physical-size',
    });
    expect(svgUnitScaleToMm('<svg viewBox="0 0 96 96"/>')).toEqual({
        scale: 25.4 / 96,
        source: 'svg-pixels',
    });
});

test('importVectorFile rejects unsupported files', async () => {
    const file = new File(['hello'], 'note.txt');
    await expect(importVectorFile(file)).rejects.toThrow(/Unsupported/);
});

test('SVG physical metadata sets curve error in millimetres rather than raw viewBox units', async () => {
    const file = new File(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="1000mm" viewBox="0 0 10 10"><path d="M1 1H3A0.5 0.5 0 0 1 4 1V3H1Z"/></svg>',
        ],
        'large-curve.svg',
    );
    const imported = await importVectorFile(file);
    expect(imported.unitScaleToMm).toBe(100);
    const points = scaleImportResult(imported, 100).loops[0].points;
    let maximum = 0;
    for (let i = 0; i <= 1000; i++) {
        const a = Math.PI + (Math.PI * i) / 1000,
            p = {
                x: (3.5 + 0.5 * Math.cos(a)) * 100,
                y: (9 - 0.5 * Math.sin(a)) * 100,
            };
        let closest = Infinity;
        for (let j = 1; j < points.length; j++) {
            const first = points[j - 1],
                last = points[j],
                dx = last.x - first.x,
                dy = last.y - first.y;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((p.x - first.x) * dx + (p.y - first.y) * dy) /
                        (dx * dx + dy * dy || 1),
                ),
            );
            closest = Math.min(
                closest,
                Math.hypot(p.x - first.x - t * dx, p.y - first.y - t * dy),
            );
        }
        maximum = Math.max(maximum, closest);
    }
    expect(maximum).toBeLessThan(0.05);
});

test('SVG unit conversion scales bitmap placement and keeps asset identity and rotation', () => {
    const result = {
        fileName: 'mixed.svg',
        entityCount: 1,
        loops: [
            {
                id: 'shape',
                bitmapId: 'photo',
                points: [
                    { x: 1, y: 2 },
                    { x: 4, y: 6 },
                ],
            },
        ],
        bitmaps: [
            {
                id: 'photo',
                x: 1,
                y: 2,
                w: 3,
                h: 4,
                rotation: 30,
                dataUrl: 'data:image/png;base64,AA==',
            },
        ],
        bounds: { minX: 1, minY: 2, maxX: 4, maxY: 6 },
        unitScaleToMm: 1,
        unitSource: 'svg-pixels' as const,
    };
    const scaled = scaleImportResult(result, 25.4);
    expect(scaled.bitmaps?.[0]).toMatchObject({
        id: 'photo',
        x: 25.4,
        y: 50.8,
        h: 101.6,
        rotation: 30,
        dataUrl: result.bitmaps[0].dataUrl,
    });
    expect(scaled.bitmaps?.[0].w).toBeCloseTo(76.2, 10);
    expect(scaled.loops[0].bitmapId).toBe('photo');
    expect(result.bitmaps[0].w).toBe(3);
});
