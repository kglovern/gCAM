/**
 * Tests: compact project files drop rebuildable toolpath geometry, reload to
 * byte-identical G-code, and report rebuild failures or drift.
 */
import { jest } from '@jest/globals';
import {
    buildToolpathGcode,
    combineToolpaths,
    type ProfileArgs,
    type ToolpathResult,
} from '../lib/engine';
import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from '../lib/project';
import { DEFAULT_LAYER } from '../layers/model';
import { DEFAULT_JOB_STOCK } from '../job/stock';
import { previewFor } from './useToolpathStack';
import {
    describeRegenerationReport,
    hasPendingRegeneration,
    regenerateStack,
} from './regenerate-stack';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
    { x: 0, y: 30 },
];

async function entry(id: string, args: ProfileArgs, customLabel?: string) {
    const result = await buildToolpathGcode(args);
    const label = customLabel ?? result.label;
    return {
        id,
        label,
        customLabel,
        args,
        preview: previewFor(result),
        toolpath: { ...result.toolpath, label },
    };
}

async function snapshot(): Promise<ProjectSnapshot> {
    const loops = [{ id: 'sq', points: SQUARE }];
    return {
        layers: [DEFAULT_LAYER],
        loops,
        selected: [],
        hidden: [],
        stack: [
            await entry('outside', {
                loops,
                operation: 'profile-outside',
                toolDiameter: 6,
                cutDepth: 3,
                passDepth: 1,
                tabs: [{ contourIndex: 0, along: 10 }],
                tabWidth: 6,
                tabHeight: 1,
            }),
            await entry(
                'pocket',
                {
                    loops,
                    operation: 'pocket',
                    toolDiameter: 3,
                    cutDepth: 2,
                    overlapPercent: 40,
                },
                'Floor',
            ),
            {
                id: 'surface',
                label: 'Surface',
                args: { operation: 'surface-finish', loops },
                preview: [{ points: SQUARE }],
                toolpath: {
                    operation: 'surface-finish',
                    motionPaths: [{ points: SQUARE }],
                },
            },
        ],
        bitmaps: [],
        guides: [],
        fileName: 'demo',
        stock: DEFAULT_JOB_STOCK,
    };
}

const program = (stack: ProjectSnapshot['stack']) =>
    combineToolpaths(
        stack
            .filter(
                (e) =>
                    e.args &&
                    (e.args as ProfileArgs).operation !== 'surface-finish',
            )
            .map((e) => e.toolpath),
        'demo',
    );

test('compact projects drop rebuildable geometry and reload to identical G-code', async () => {
    const original = await snapshot();
    const full = serializeProject(original);
    const compact = serializeProject(original, { compact: true });
    expect(compact.length).toBeLessThan(full.length / 3);
    expect(compact).not.toContain('\n');

    const doc = JSON.parse(compact);
    expect(doc.version).toBe(5);
    const [outside, pocket, surface] = doc.snapshot.stack;
    expect(outside.preview).toEqual([]);
    expect(outside.toolpath).toMatchObject({
        id: original.stack[0].toolpath.id,
        label: original.stack[0].label,
        operation: 'profile-outside',
        pendingRegeneration: {
            digest: expect.any(String),
            keys: Object.keys(original.stack[0].toolpath),
            worker: false,
        },
    });
    expect(
        Object.values(outside.toolpath).some((value) => Array.isArray(value)),
    ).toBe(false);
    expect(pocket.toolpath.label).toBe('Floor');
    // Surface CAM needs WebGPU, so its geometry stays in the file.
    expect(surface.toolpath.motionPaths).toHaveLength(1);

    const loaded = deserializeProject(compact);
    expect(hasPendingRegeneration(loaded.stack)).toBe(true);
    const { stack, report } = await regenerateStack(loaded.stack);
    expect(report).toEqual({ failed: [], changed: [] });
    expect(hasPendingRegeneration(stack)).toBe(false);
    expect(stack[0].toolpath.id).toBe(original.stack[0].toolpath.id);
    expect(stack[1].toolpath.label).toBe('Floor');
    expect(JSON.stringify(stack)).toBe(JSON.stringify(original.stack));
    expect(program(original.stack)).toContain('G1');
    expect(program(stack)).toBe(program(original.stack));
});

test('rebuilds keep the saved toolpath shape whichever build path made it', async () => {
    const original = await snapshot();
    // Worker builds omit empty tabs and halftone fields that sync builds always set.
    const {
        tabs: _,
        halftoneResolution: __,
        halftoneInvert: ___,
        ...workerShaped
    } = original.stack[1].toolpath;
    original.stack[1] = { ...original.stack[1], toolpath: workerShaped };
    const { stack, report } = await regenerateStack(
        deserializeProject(serializeProject(original, { compact: true })).stack,
    );
    expect(report.changed).toEqual([]);
    expect(JSON.stringify(stack)).toBe(JSON.stringify(original.stack));
});

test('full saves keep every toolpath and stay at the existing version', async () => {
    const original = await snapshot();
    const doc = JSON.parse(serializeProject(original));
    expect(doc.version).toBe(2);
    expect(
        doc.snapshot.stack[0].toolpath.previewContours.length,
    ).toBeGreaterThan(0);
    expect(
        hasPendingRegeneration(deserializeProject(JSON.stringify(doc)).stack),
    ).toBe(false);
});

test('versions before 5 are rejected by readers that predate compact toolpaths', async () => {
    const doc = JSON.parse(
        serializeProject(await snapshot(), { compact: true }),
    );
    // Older builds accept versions 1–4 only, so they refuse a compact file instead of loading empty toolpaths.
    expect([1, 2, 3, 4]).not.toContain(doc.version);
});

test('stubs that cannot be rebuilt are rejected on load', async () => {
    const doc = JSON.parse(
        serializeProject(await snapshot(), { compact: true }),
    );
    delete doc.snapshot.stack[0].toolpath.pendingRegeneration.digest;
    expect(() => deserializeProject(JSON.stringify(doc))).toThrow(
        'Invalid saved toolpath.',
    );
});

test('failed rebuilds stay in the stack with output disabled and are kept on resave', async () => {
    const loaded = deserializeProject(
        serializeProject(await snapshot(), { compact: true }),
    );
    const build = jest.fn<(args: ProfileArgs) => Promise<ToolpathResult>>(
        async (args) => {
            if (args.operation === 'pocket') throw new Error('Tool too large');
            return buildToolpathGcode(args);
        },
    );
    const { stack, report } = await regenerateStack(loaded.stack, { build });
    expect(report.failed).toEqual([
        { id: 'pocket', label: 'Floor', message: 'Tool too large' },
    ]);
    expect(stack[1]).toMatchObject({
        outputEnabled: false,
        toolpath: {
            pendingRegeneration: loaded.stack[1].toolpath.pendingRegeneration,
            regenerationError: 'Tool too large',
        },
    });
    expect(describeRegenerationReport(report)).toContain(
        'Floor (Tool too large)',
    );
    const again = JSON.parse(serializeProject({ ...loaded, stack }));
    expect(again.version).toBe(5);
    expect(again.snapshot.stack[1].toolpath.pendingRegeneration).toEqual(
        loaded.stack[1].toolpath.pendingRegeneration,
    );
});

test('rebuilt geometry that differs from the saved digest is reported', async () => {
    const loaded = deserializeProject(
        serializeProject(await snapshot(), { compact: true }),
    );
    const { report } = await regenerateStack(loaded.stack, {
        build: (args) =>
            buildToolpathGcode(
                args.operation === 'pocket'
                    ? { ...args, overlapPercent: 60 }
                    : args,
            ),
    });
    expect(report.changed).toEqual([{ id: 'pocket', label: 'Floor' }]);
    expect(describeRegenerationReport(report)).toContain(
        'Review before cutting',
    );
});

test('paired V-carve finishes rebuild alone with edge finishing', async () => {
    const build = jest.fn<(args: ProfileArgs) => Promise<ToolpathResult>>(
        async () => ({
            gcode: '',
            label: 'V-Carve',
            previewContours: [],
            toolpath: { operation: 'vcarve' },
        }),
    );
    await regenerateStack(
        [
            {
                id: 'v',
                label: 'V-Carve',
                args: {
                    operation: 'vcarve',
                    loops: [],
                    vCarveClearingTool: { toolDiameter: 3, toolNumber: 2 },
                },
                preview: [],
                toolpath: {
                    operation: 'vcarve',
                    pendingRegeneration: {
                        digest: '',
                        keys: ['operation'],
                        worker: true,
                    },
                },
            },
        ],
        { build },
    );
    const args = build.mock.calls[0][0];
    expect(args.vCarveClearingTool).toBeUndefined();
    expect(args.vCarveEdgeFinish).toBe(true);
});

test('aborting stops before the next rebuild', async () => {
    const loaded = deserializeProject(
        serializeProject(await snapshot(), { compact: true }),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
        regenerateStack(loaded.stack, { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
});

test('entries rebuild on the build path that made them', async () => {
    const original = await snapshot();
    const toolpath = original.stack[0].toolpath as { sourceLoops: object[] };
    // The CAM worker client tags every source loop; the main-thread build does not.
    original.stack[0] = {
        ...original.stack[0],
        toolpath: {
            ...toolpath,
            sourceLoops: toolpath.sourceLoops.map((loop) => ({
                ...loop,
                isBitmap: false,
            })),
        },
    };
    const loaded = deserializeProject(
        serializeProject(original, { compact: true }),
    );
    expect(
        loaded.stack.map(
            (e) =>
                (e.toolpath.pendingRegeneration as { worker?: boolean })
                    ?.worker,
        ),
    ).toEqual([true, false, undefined]);
    const build = jest.fn((args: ProfileArgs, _useWorker: boolean) =>
        buildToolpathGcode(args),
    );
    const global = globalThis as { Worker?: unknown };
    global.Worker = class {};
    try {
        await regenerateStack(loaded.stack, { build });
    } finally {
        delete global.Worker;
    }
    expect(build.mock.calls.map(([, useWorker]) => useWorker)).toEqual([
        true,
        false,
    ]);
});

test('projects too large to stringify name their largest part', async () => {
    const original = await snapshot();
    original.stack[1] = {
        ...original.stack[1],
        toolpath: {
            ...original.stack[1].toolpath,
            cache: new Float32Array(1_000_000),
        },
    };
    const stringify = jest
        .spyOn(JSON, 'stringify')
        .mockImplementationOnce(() => {
            throw new RangeError('Invalid string length');
        });
    try {
        expect(() => serializeProject(original, { compact: true })).toThrow(
            'Project is too large to save: project.snapshot.stack.1.toolpath.cache is about 10 MB.',
        );
    } finally {
        stringify.mockRestore();
    }
});
