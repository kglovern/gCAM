import { planMeshToolpath } from './meshToolpath';
import { isRotaryToolpathEntry } from './types';
import type {
    RotaryOperation,
    RotaryToolpathEntry,
    RotaryOps,
    RotaryStock,
    RotaryMode,
    ProfileSample,
    PommelZone,
    RotaryTool,
    RotaryCheck,
    StlMesh,
} from './types';
import { planToolpath } from './toolpath';
import { runChecks } from './checks';
import { toGcode } from './gcode';

export const ROTARY_OPERATIONS: { value: RotaryOperation; label: string }[] = [
    { value: 'face', label: 'Facing' },
    { value: 'rough', label: 'Roughing' },
    { value: 'finish', label: 'Finishing' },
    { value: 'groove', label: 'Groove' },
    { value: 'part', label: 'Part-off' },
];
export const operationLabel = (operation: RotaryOperation) =>
    ROTARY_OPERATIONS.find((item) => item.value === operation)!.label;
export function operationOps(
    operation: RotaryOperation,
    ops: Omit<RotaryOps, 'pommels' | 'compR'>,
) {
    return {
        ...ops,
        face: operation === 'face',
        rough: operation === 'rough',
        finish: operation === 'finish',
        groove: { ...ops.groove, on: operation === 'groove' },
        part: { ...ops.part, on: operation === 'part' },
    };
}
export function cloneToolpath(entry: RotaryToolpathEntry): RotaryToolpathEntry {
    return {
        ...entry,
        tool: { ...entry.tool },
        ops: {
            ...operationOps(entry.operation, entry.ops),
            ...(entry.ops.mesh ? { mesh: { ...entry.ops.mesh } } : {}),
        },
    };
}
/** Entry IDs and the automatic/manual UI switch do not change cutter motion. */
export function toolpathSettingsKey(entry: RotaryToolpathEntry) {
    return JSON.stringify([
        entry.operation,
        { ...entry.tool, manualCuttingParams: undefined },
        cloneToolpath(entry).ops,
    ]);
}
export function legacyToolpaths(
    tool: RotaryTool,
    ops: Omit<RotaryOps, 'pommels' | 'compR'>,
) {
    return ROTARY_OPERATIONS.filter(({ value }) =>
        value === 'groove'
            ? ops.groove.on
            : value === 'part'
              ? ops.part.on
              : ops[value],
    ).map(({ value }, i) =>
        cloneToolpath({ id: `legacy-${i}`, operation: value, tool, ops }),
    );
}
export function planRotaryEntry(
    entry: RotaryToolpathEntry,
    samples: ProfileSample[],
    stock: RotaryStock,
    mode: RotaryMode,
    pommels: PommelZone[],
    mesh?: StlMesh | null,
    onProgress: (fraction: number) => void = () => {},
) {
    if (!isRotaryToolpathEntry(entry))
        return {
            entry,
            compR: 0,
            moves: [],
            flags: [
                {
                    level: 'e' as const,
                    msg: 'Use valid cutter dimensions, feeds and pass depth.',
                },
            ],
        };
    if (mode === 'stl') {
        try {
            if (!mesh)
                throw new Error(
                    'Import an STL before planning mesh toolpaths.',
                );
            if (!entry.ops.mesh)
                throw new Error(
                    'Configure XYZA mesh settings; old turning-envelope STL paths are disabled.',
                );
            if (entry.operation !== 'rough' && entry.operation !== 'finish')
                throw new Error(
                    'STL mesh mode currently supports roughing and finishing only. Use profile mode for turning operations.',
                );
            if (pommels.length)
                throw new Error(
                    'Mesh paths do not support pommel exclusions yet. Remove them before planning.',
                );
            const flags: RotaryCheck[] = [];
            return {
                entry,
                compR: 0,
                moves: planMeshToolpath(
                    mesh,
                    stock,
                    entry.tool,
                    entry.operation,
                    entry.ops.roughStep,
                    entry.ops.allow,
                    entry.ops.mesh,
                    undefined,
                    (msg) => flags.push({ level: 'w', msg }),
                    onProgress,
                ),
                flags,
            };
        } catch (error) {
            return {
                entry,
                compR: 0,
                moves: [],
                flags: [
                    {
                        level: 'e' as const,
                        msg:
                            error instanceof Error
                                ? error.message
                                : 'Mesh planning failed.',
                    },
                ],
            };
        }
    }
    const compR = 0;
    const ops = { ...operationOps(entry.operation, entry.ops), compR, pommels };
    return {
        entry,
        compR,
        moves: planToolpath(samples, stock, entry.tool, ops),
        flags: runChecks(samples, stock, entry.tool, ops),
    };
}
export function planRotaryJob(
    entries: RotaryToolpathEntry[],
    samples: ProfileSample[],
    stock: RotaryStock,
    mode: RotaryMode,
    pommels: PommelZone[],
    mesh?: StlMesh | null,
    onProgress: (fraction: number) => void = () => {},
) {
    const paths = entries.map((entry, index) => {
        const path = planRotaryEntry(
            entry,
            samples,
            stock,
            mode,
            pommels,
            mesh,
            (fraction) => onProgress((index + fraction) / entries.length),
        );
        onProgress((index + 1) / entries.length);
        return path;
    });
    return combineRotaryPaths(paths);
}
export function combineRotaryPaths(
    paths: ReturnType<typeof planRotaryEntry>[],
) {
    const flags: RotaryCheck[] = paths.flatMap((path) =>
        path.flags
            .filter((flag) => flag.level !== 'o')
            .map((flag) => ({
                ...flag,
                msg: `${operationLabel(path.entry.operation)}: ${flag.msg}`,
            })),
    );
    if (
        paths.some(
            ({ entry }, index) =>
                entry.operation === 'part' && index !== paths.length - 1,
        )
    )
        flags.push({
            level: 'e',
            msg: 'Part-off must be the last toolpath. Move it below the other operations.',
        });
    return { paths, moves: paths.flatMap((path) => path.moves), flags };
}
export function rotaryJobGcode(
    job: ReturnType<typeof planRotaryJob>,
    stock: RotaryStock,
    mode: RotaryMode,
    name: string,
) {
    if (!job.paths.length || job.flags.some((flag) => flag.level === 'e'))
        return '';
    const lines: string[] = [];
    job.paths.forEach((path, index) => {
        const previous = job.paths[index - 1]?.entry.tool;
        const tool = path.entry.tool;
        const toolChange =
            !previous ||
            previous.slotNum !== tool.slotNum ||
            previous.type !== tool.type ||
            previous.dia !== tool.dia;
        lines.push(
            `(Toolpath ${index + 1}: ${operationLabel(path.entry.operation)})`,
        );
        const programLines = toGcode(path.moves, {
            stock,
            tool,
            name,
            mode,
            compR: path.compR,
            toolChange,
        })
            .trim()
            .split(/\r?\n/)
            .filter((line) => line !== 'M2');
        for (const line of programLines) lines.push(line);
    });
    return `${lines.join('\r\n')}\r\nM2\r\n`;
}
