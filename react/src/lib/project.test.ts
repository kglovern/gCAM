/**
 * Tests: project round-trips through the gcam envelope; legacy camcanvas envelopes still load; v1 projects migrate to the current snapshot shape; garbage is rejected with a clear error.
 */
import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from './project';
import { DEFAULT_LAYER } from '../layers/model';
import { DEFAULT_JOB_STOCK } from '../job/stock';
import { controllerPreset } from '../gcode/profiles';
import { createLaserToolpath } from '../cam/laser.js';
import { buildGcode } from '../cam/gcode/program.js';
import {
    rasterCases,
    rasterRequest,
    rasterSegments,
} from '../cam/fixtures/laser-raster-cases.js';

const SNAP: ProjectSnapshot = {
    layers: [DEFAULT_LAYER],
    loops: [{ points: [{ x: 0, y: 0 }], groupId: 'group-1' }],
    selected: ['a'],
    hidden: [],
    stack: [
        {
            id: 'tp-1',
            label: 'Profile Outside (1 vector)',
            args: { operation: 'profile-outside' },
            preview: [],
            toolpath: {},
        },
    ],
    bitmaps: [],
    guides: [],
    fileName: 'demo',
    stock: DEFAULT_JOB_STOCK,
};

test('project round-trips through the gcam envelope', () => {
    const raw = serializeProject(SNAP);
    expect(raw).toContain('"gcam.project"');
    const back = deserializeProject(raw);
    expect(back).toEqual(SNAP);
});

test('older per-segment laser projects still load and can be resaved compactly', () => {
    const { config, options } = rasterRequest(rasterCases[0]);
    const path = createLaserToolpath([], config, options);
    const segments = rasterSegments(path.previewContours);
    const snapshot = {
        ...SNAP,
        stack: [
            {
                id: 'older-raster',
                label: 'Older raster',
                args: { operation: 'laser-raster' },
                toolpath: { ...path, previewContours: segments },
                preview: segments.map(
                    (
                        points: { x: number; y: number }[] & {
                            _laserPower?: number;
                        },
                    ) => ({
                        points,
                        laserPower: points._laserPower,
                    }),
                ),
            },
        ],
    };
    const older = deserializeProject(
        JSON.stringify({ kind: 'gcam.project', version: 2, snapshot }),
    );
    expect(older.stack[0].preview).toHaveLength(segments.length);
    expect(older.stack[0].preview[0]).toMatchObject({
        laserPower: segments[0]._laserPower,
    });
    const resaved = deserializeProject(serializeProject(older));
    expect(resaved.stack[0].preview[0].variableLaserPower).toBe(true);
    expect(resaved.stack[0].toolpath.laserPaths).toEqual(
        older.stack[0].toolpath.laserPaths,
    );
    const program = (p: Record<string, unknown>) =>
        buildGcode({
            toolpaths: [p],
            fileName: 'older',
            forcePolylineArcs: true,
        });
    expect(program(resaved.stack[0].toolpath)).toBe(
        program(older.stack[0].toolpath),
    );
});

test('row laser previews keep their power metadata and identical output after project reload', () => {
    const { config, options } = rasterRequest(rasterCases[0]);
    const path = createLaserToolpath([], config, options);
    const snapshot = {
        ...SNAP,
        stack: [
            {
                id: 'raster',
                label: 'Raster',
                args: { operation: 'laser-raster' },
                preview: path.previewContours.map((points) => ({
                    points,
                    variableLaserPower: true,
                })),
                toolpath: path,
            },
        ],
    };
    const raw = serializeProject(snapshot);
    const saved = JSON.parse(raw).snapshot.stack[0];
    expect(saved.preview).toEqual([]);
    expect(saved.toolpath.previewContours).toEqual([]);
    expect(saved.toolpath.previewFromLaserPaths).toBe(true);
    expect(raw.length).toBeLessThan(
        JSON.stringify({ snapshot }, null, 2).length * 0.7,
    );
    const loaded = deserializeProject(raw);
    expect(loaded.stack[0].preview[0].variableLaserPower).toBe(true);
    expect(loaded.stack[0].preview[0].points.map((p) => ({ ...p }))).toEqual(
        path.previewContours[0].map((p) => ({ ...p })),
    );
    const program = (toolpath: Record<string, unknown>) =>
        buildGcode({
            toolpaths: [toolpath],
            fileName: 'raster',
            forcePolylineArcs: true,
        });
    expect(program(loaded.stack[0].toolpath)).toBe(program(path));
    saved.toolpath.laserPaths[0].points[0].power = -1;
    const corrupt = JSON.parse(raw);
    corrupt.snapshot.stack[0] = saved;
    expect(() => deserializeProject(JSON.stringify(corrupt))).toThrow(
        'Invalid saved laser motion',
    );
});

test('projects retain custom controller blocks and reject corrupt output settings', () => {
    const outputSettings = controllerPreset('duet');
    outputSettings.name = 'Workshop Duet';
    outputSettings.blocks.start = '(Job {jobName})';
    outputSettings.delaySeconds = 2;
    const back = deserializeProject(
        serializeProject({ ...SNAP, outputSettings }),
    );
    expect(back.outputSettings).toEqual(outputSettings);
    expect(() =>
        deserializeProject(
            serializeProject({
                ...SNAP,
                outputSettings: { ...outputSettings, decimals: -1 },
            }),
        ),
    ).toThrow('Invalid G-code settings');
});

test('legacy camcanvas envelopes still load', () => {
    const raw = serializeProject(SNAP).replace(
        '"gcam.project"',
        '"camcanvas.project"',
    );
    expect(deserializeProject(raw).fileName).toBe('demo');
});

test('v1 projects migrate to the current snapshot shape', () => {
    const raw = JSON.stringify({
        kind: 'gcam.project',
        version: 1,
        fileName: 'legacy',
        snapshot: { loops: [], stack: [] },
    });
    expect(deserializeProject(raw)).toEqual({
        loops: [],
        selected: [],
        hidden: [],
        stack: [],
        bitmaps: [],
        guides: [],
        fileName: 'legacy',
        layers: [DEFAULT_LAYER],
        stock: DEFAULT_JOB_STOCK,
    });
});

test('garbage is rejected with a clear error', () => {
    expect(() => deserializeProject('nope')).toThrow(/valid gCAM/);
    expect(() =>
        deserializeProject(JSON.stringify({ kind: 'x', version: 9 })),
    ).toThrow(/valid gCAM/);
});

test('opaque rotary slice round-trips untouched', () => {
    const rotary = { name: 'leg', mode: 'profile', custom: [1, 2, 3] };
    const back = deserializeProject(serializeProject({ ...SNAP, rotary }));
    expect(back.rotary).toEqual(rotary);
});

test('files without a rotary slice load as before', () => {
    const back = deserializeProject(serializeProject(SNAP));
    expect(back.rotary).toBeUndefined();
    expect(back).toEqual(SNAP);
});

test('operation names and output switches survive portable project export', () => {
    const entry = {
        ...SNAP.stack[0],
        label: 'Cut outline',
        customLabel: 'Cut outline',
        outputEnabled: false,
    };
    expect(
        deserializeProject(serializeProject({ ...SNAP, stack: [entry] })).stack,
    ).toEqual([entry]);
});

test('repeated bitmap sources save once without sharing editable placements', () => {
    const source = 'data:image/png;base64,' + 'A'.repeat(100000);
    const bitmaps = Array.from({ length: 100 }, (_, i) => ({
        id: `bitmap-${i}`,
        x: i * 3,
        y: i * 2,
        w: 20,
        h: 10,
        rotation: i,
        dataUrl: source,
    }));
    const snapshot = { ...SNAP, bitmaps };
    const original = JSON.stringify(snapshot);
    const raw = serializeProject(snapshot),
        envelope = JSON.parse(raw);
    expect(envelope.version).toBe(3);
    expect(envelope.bitmapSources).toEqual([source]);
    expect(
        envelope.snapshot.bitmaps.every(
            (b: { sourceIndex: number; dataUrl?: string }) =>
                b.sourceIndex === 0 && b.dataUrl === undefined,
        ),
    ).toBe(true);
    expect(raw.length).toBeLessThan(original.length * 0.02);
    expect(JSON.stringify(snapshot)).toBe(original);
    const loaded = deserializeProject(raw);
    expect(loaded).toEqual(snapshot);
    loaded.bitmaps[0].x = -100;
    expect(loaded.bitmaps[1].x).toBe(3);
});

test('different sources, asset keys and mesh metadata survive shared-source export', () => {
    const a = {
        id: 'a',
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        dataUrl: 'png-a',
        assetId: 'local-a',
    };
    const b = {
        ...a,
        id: 'b',
        dataUrl: 'png-b',
        surfaceMesh: { custom: true },
    };
    const snapshot = {
        ...SNAP,
        bitmaps: [a, b, { ...a, id: 'c', x: 10 }],
    } as unknown as ProjectSnapshot;
    const raw = serializeProject(snapshot);
    expect(JSON.parse(raw).bitmapSources).toEqual(['png-a', 'png-b']);
    expect(deserializeProject(raw)).toEqual(snapshot);
    expect(
        JSON.parse(serializeProject({ ...SNAP, bitmaps: [a] })).version,
    ).toBe(2);
});

test.each([-1, 0.5, 2, '0', null])(
    'rejects an invalid shared bitmap reference %s',
    (index) => {
        const bitmap = { id: 'b', x: 0, y: 0, w: 1, h: 1, dataUrl: 'png' };
        const doc = JSON.parse(
            serializeProject({
                ...SNAP,
                bitmaps: [bitmap, { ...bitmap, id: 'c' }],
            }),
        );
        doc.snapshot.bitmaps[0].sourceIndex = index;
        expect(() => deserializeProject(JSON.stringify(doc))).toThrow(
            'bitmap source reference',
        );
    },
);

test('rejects a missing or ambiguous shared bitmap source table', () => {
    const bitmap = { id: 'b', x: 0, y: 0, w: 1, h: 1, dataUrl: 'png' };
    const doc = JSON.parse(
        serializeProject({
            ...SNAP,
            bitmaps: [bitmap, { ...bitmap, id: 'c' }],
        }),
    );
    for (const table of [undefined, {}, [null], [42]]) {
        expect(() =>
            deserializeProject(
                JSON.stringify({ ...doc, bitmapSources: table }),
            ),
        ).toThrow('bitmap sources');
    }
    doc.snapshot.bitmaps[0].dataUrl = 'conflicting';
    expect(() => deserializeProject(JSON.stringify(doc))).toThrow(
        'bitmap source reference',
    );
});

test('bitmap mask links survive portable project export and malformed dependencies reject', () => {
    const bitmap = {
        id: 'image',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        dataUrl: 'data:image/png;base64,AA==',
        maskSourceIds: ['mask'],
    };
    const snapshot = { ...SNAP, stack: [], bitmaps: [bitmap] };
    expect(JSON.parse(serializeProject(snapshot)).version).toBe(4);
    expect(
        deserializeProject(serializeProject(snapshot)).bitmaps[0].maskSourceIds,
    ).toEqual(['mask']);
    expect(() =>
        deserializeProject(
            JSON.stringify({
                kind: 'gcam.project',
                version: 2,
                fileName: 'Invalid',
                snapshot: {
                    ...snapshot,
                    bitmaps: [{ ...bitmap, maskSourceIds: ['same', 'same'] }],
                },
            }),
        ),
    ).toThrow(/linked image mask/);
});
