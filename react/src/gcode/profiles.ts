/** Controller output settings. Geometry remains in the CAM emitters. */
export type ControllerId =
    | 'grblhal'
    | 'grbl'
    | 'duet'
    | 'marlin'
    | 'linuxcnc'
    | 'mach3'
    | 'mach4';
export const BLOCK_LABELS = {
    start: 'Program start',
    operationStart: 'Operation start',
    operationEnd: 'Operation end',
    spindleStart: 'Spindle start / speed change',
    spindleStop: 'Spindle stop',
    coolantOn: 'Coolant on',
    coolantOff: 'Coolant off',
    laserStart: 'Laser start',
    laserStop: 'Laser stop',
    end: 'Program end',
} as const;
export type BlockId = keyof typeof BLOCK_LABELS;
export interface OutputSettings {
    controller: ControllerId;
    name: string;
    arcs: boolean;
    comments: 'parentheses' | 'semicolon' | 'none';
    dwell: 'P-seconds' | 'P-milliseconds' | 'S-seconds';
    delaySeconds: number;
    decimals: number;
    extension: string;
    lineEnding: 'source' | 'LF' | 'CRLF';
    laserMax: number;
    laserConfirmed: boolean;
    spindleSlot: number;
    blocks: Record<BlockId, string>;
}
const blocks: OutputSettings['blocks'] = {
    start: '',
    operationStart: '',
    operationEnd: '',
    spindleStart: 'M3 S{spindleSpeed}',
    spindleStop: 'M5',
    coolantOn: '',
    coolantOff: '',
    laserStart: 'M4 S0',
    laserStop: 'M5',
    end: '{programEnd}',
};
export const CONTROLLERS: { id: ControllerId; label: string; note: string }[] =
    [
        {
            id: 'grblhal',
            label: 'grblHAL',
            note: 'Rotary requires an A-axis build. Laser requires a laser-capable output and matching power range.',
        },
        {
            id: 'grbl',
            label: 'Grbl 1.1',
            note: 'Three axes. Laser requires laser mode and a matching $30 power range. Firmware settings are not changed.',
        },
        {
            id: 'duet',
            label: 'Duet / RepRapFirmware 3.5+',
            note: 'Requires configured CNC or laser mode. Rotary requires an angular A axis. Spindle slot must match the machine.',
        },
        {
            id: 'marlin',
            label: 'Marlin 2.1.1+ — CNC / inline laser',
            note: 'Arcs, spindle and inline laser commands require matching firmware build options. Rotary export is not supported by this preset.',
        },
        {
            id: 'linuxcnc',
            label: 'LinuxCNC',
            note: 'Laser output depends on HAL wiring and synchronized outputs; no generic laser preset is provided.',
        },
        {
            id: 'mach3',
            label: 'Mach3 Mill',
            note: 'Dwell units must match General Config. Laser output depends on the motion plugin; no generic laser preset is provided.',
        },
        {
            id: 'mach4',
            label: 'Mach4 Mill',
            note: 'Laser output depends on the motion plugin and output configuration; no generic laser preset is provided.',
        },
    ];
export function controllerPreset(
    controller: ControllerId = 'grblhal',
): OutputSettings {
    const mach = controller === 'mach3' || controller === 'mach4';
    const rs274 = mach || controller === 'linuxcnc';
    return {
        controller,
        name: CONTROLLERS.find((item) => item.id === controller)!.label,
        arcs: controller !== 'marlin',
        comments:
            controller === 'duet' || controller === 'marlin'
                ? 'semicolon'
                : 'parentheses',
        dwell:
            controller === 'duet' || controller === 'marlin'
                ? 'S-seconds'
                : 'P-seconds',
        delaySeconds: 0,
        decimals: 5,
        extension: ['grblhal', 'grbl', 'marlin'].includes(controller)
            ? 'gcode'
            : 'nc',
        lineEnding: controller === 'grblhal' ? 'source' : mach ? 'CRLF' : 'LF',
        laserMax: controller === 'duet' || controller === 'marlin' ? 255 : 1000,
        laserConfirmed: controller === 'grblhal',
        spindleSlot: 0,
        blocks: {
            ...blocks,
            start: rs274 ? 'G91.1\nG94' : '',
            spindleStart:
                controller === 'duet'
                    ? 'M3 P{spindleSlot} S{spindleSpeed}'
                    : blocks.spindleStart,
            laserStart:
                controller === 'marlin'
                    ? 'M4 I S0'
                    : controller === 'duet'
                      ? 'M3 S0'
                      : blocks.laserStart,
            laserStop: controller === 'marlin' ? 'M5 I' : 'M5',
            end:
                controller === 'duet' || controller === 'marlin'
                    ? ''
                    : '{programEnd}',
        },
    };
}
export const DEFAULT_OUTPUT = controllerPreset();
export function validateOutput(value: unknown): OutputSettings {
    if (!value || typeof value !== 'object')
        throw new Error('Invalid G-code settings.');
    const v = value as OutputSettings;
    if (!CONTROLLERS.some((item) => item.id === v.controller))
        throw new Error('Unknown controller preset.');
    if (
        typeof v.name !== 'string' ||
        v.name.length > 100 ||
        typeof v.arcs !== 'boolean' ||
        typeof v.laserConfirmed !== 'boolean' ||
        !['parentheses', 'semicolon', 'none'].includes(v.comments) ||
        !['P-seconds', 'P-milliseconds', 'S-seconds'].includes(v.dwell) ||
        !['source', 'LF', 'CRLF'].includes(v.lineEnding) ||
        !/^[a-zA-Z0-9]{1,10}$/.test(v.extension) ||
        !Number.isFinite(v.delaySeconds) ||
        v.delaySeconds < 0 ||
        v.delaySeconds > 3600 ||
        !Number.isInteger(v.decimals) ||
        v.decimals < 3 ||
        v.decimals > 6 ||
        !Number.isFinite(v.laserMax) ||
        v.laserMax <= 0 ||
        v.laserMax > 1000000 ||
        !Number.isInteger(v.spindleSlot) ||
        v.spindleSlot < 0 ||
        v.spindleSlot > 255 ||
        !v.blocks ||
        Object.keys(BLOCK_LABELS).some(
            (key) =>
                typeof v.blocks[key as BlockId] !== 'string' ||
                v.blocks[key as BlockId].length > 10000,
        )
    ) {
        throw new Error(
            'Invalid G-code settings. Check numeric values and command blocks.',
        );
    }
    return { ...v, blocks: { ...v.blocks } };
}
export const OUTPUT_STORAGE_KEY = 'gcam.output.v1';
export function loadOutput(): OutputSettings {
    try {
        const raw = localStorage.getItem(OUTPUT_STORAGE_KEY);
        return raw
            ? validateOutput(JSON.parse(raw))
            : {
                  ...controllerPreset(),
                  arcs: localStorage.getItem('gcam.emitArcs') !== 'false',
              };
    } catch {
        return controllerPreset();
    }
}
export function outputError(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Unable to generate G-code.';
}
