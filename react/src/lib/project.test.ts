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
