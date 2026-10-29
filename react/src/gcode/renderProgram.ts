import {
    DEFAULT_OUTPUT,
    type BlockId,
    type OutputSettings,
    validateOutput,
} from './profiles';
import type { UnitSystem } from '../lib/units';

export interface ProgramContext {
    fileName?: string;
    laser?: boolean;
    rotary?: boolean;
    operations?: {
        marker: string;
        name: string;
        values?: Record<string, string | number>;
    }[];
}
const numericWord = /([A-Z])([+-]?(?:\d+\.?\d*|\.\d+))/gi;
function splitComments(line: string): { code: string; comments: string[] } {
    let code = '',
        comment = '',
        depth = 0;
    const comments: string[] = [];
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '(') {
            if (depth++) comment += ' ';
        } else if (char === ')' && depth) {
            if (!--depth) {
                comments.push(comment);
                comment = '';
            } else comment += ' ';
        } else if (!depth && char === ';') {
            comments.push(line.slice(i + 1));
            break;
        } else if (depth) comment += char;
        else code += char;
    }
    if (depth) comments.push(comment);
    return { code: code.trim(), comments };
}
const stripComments = (line: string) => splitComments(line).code;
const cleanText = (text: string) =>
    text.replace(/[(){}\[\];\r\n\x00-\x1f]/g, ' ');

/** Expand named export values only. Never evaluate JavaScript or sender expressions. */
export function expandBlock(
    template: string,
    values: Record<string, string | number>,
): string[] {
    const expanded = template.replace(/\{([^{}]+)\}/g, (_all, key: string) => {
        if (!Object.prototype.hasOwnProperty.call(values, key))
            throw new Error(`Unknown export variable: ${key}`);
        const value = values[key];
        if (typeof value === 'number' && !Number.isFinite(value))
            throw new Error(`Invalid export value: ${key}`);
        return String(value);
    });
    if (
        /[{}\[\]\x00-\x08\x0b\x0c\x0e-\x1f]/.test(expanded) ||
        /^\s*%/m.test(expanded)
    )
        throw new Error(
            'Command blocks require resolved export values; sender expressions are unavailable.',
        );
    const lines = expanded.split(/\r?\n/).filter((line) => line.trim());
    let relative = false;
    for (const line of lines) {
        const code = stripComments(line).toUpperCase();
        for (const match of code.matchAll(numericWord)) {
            if (match[1] !== 'G') continue;
            const g = Number(match[2]);
            if ([20, 21, 93, 95, 18, 19, 90.1].includes(g))
                throw new Error(
                    'Command blocks must preserve output units, XY plane, feed mode and incremental arc centres.',
                );
            if (g === 91) relative = true;
            if (g === 90) relative = false;
        }
    }
    if (relative)
        throw new Error('Command block changes to G91 without restoring G90.');
    return lines;
}

/** Render the canonical CAM program using controller commands, then format once. */
export function renderProgram(
    canonical: string,
    input: OutputSettings,
    units: UnitSystem = 'metric',
    context: ProgramContext = {},
): string {
    if (!canonical.trim()) return '';
    const settings = validateOutput(input);
    const { controller } = settings;
    if (context.rotary && (controller === 'grbl' || controller === 'marlin'))
        throw new Error(
            `${settings.name}: rotary export is not supported by this preset.`,
        );
    if (context.laser && ['linuxcnc', 'mach3', 'mach4'].includes(controller))
        throw new Error(
            `${settings.name}: laser requires a machine-specific synchronized output profile; generic spindle commands are not a laser preset.`,
        );
    if (context.laser && !settings.laserConfirmed)
        throw new Error(
            'Confirm the laser mode and power range in Config → G-code before exporting.',
        );
    if (controller === 'marlin' && units === 'imperial')
        throw new Error(
            'Marlin preset requires millimetres. Select metric units before exporting.',
        );
    const values: Record<string, string | number> = {
        jobName: cleanText(context.fileName || 'gcam'),
        operationName: '',
        toolNumber: 1,
        spindleSpeed: 0,
        spindleSlot: settings.spindleSlot,
        delaySeconds: settings.delaySeconds,
        delay:
            settings.dwell === 'P-milliseconds'
                ? Math.round(settings.delaySeconds * 1000)
                : settings.delaySeconds,
        laserMax: settings.laserMax,
        programEnd: context.rotary && controller === 'grblhal' ? 'M2' : 'M30',
    };
    for (const [key, value] of Object.entries(
        context.operations?.[0]?.values ?? {},
    ))
        values[key] = typeof value === 'string' ? cleanText(value) : value;
    // Validate every block, including currently unused events, before emitting a file.
    for (const block of Object.values(settings.blocks))
        expandBlock(block, {
            toolName: '',
            toolDiameter: 0,
            feedRate: 0,
            plungeRate: 0,
            safeZ: 0,
            ...values,
        });
    // Keep the established grblHAL output byte-for-byte, including rotary feed precision.
    if (
        units === 'metric' &&
        JSON.stringify(settings) === JSON.stringify(DEFAULT_OUTPUT)
    )
        return canonical.endsWith('\n') ? canonical : `${canonical}\n`;
    const lines: string[] = [];
    const emit = (id: BlockId) =>
        lines.push(...expandBlock(settings.blocks[id], values));
    let started = false;
    let operation = false;
    let pendingOperation = false;
    let laserActive = false;
    let tool = 1;
    let canonicalPower = 0;
    const requestedTools = new Set(
        [...canonical.matchAll(/\bT(\d+)\s*M6/g)].map((match) => match[1]),
    );
    const markers = new Map(context.operations?.map((op) => [op.marker, op]));
    for (const raw of canonical.split(/\r?\n/)) {
        let outputRaw = raw;
        if (!raw.trim()) continue;
        if (markers.has(raw)) {
            if (operation && !pendingOperation) emit('operationEnd');
            const current = markers.get(raw)!;
            values.operationName = cleanText(current.name);
            for (const [key, value] of Object.entries(current.values ?? {}))
                values[key] =
                    typeof value === 'string' ? cleanText(value) : value;
            operation = true;
            lines.push(raw);
            if (started) emit('operationStart');
            else pendingOperation = true;
            continue;
        }
        const code = stripComments(raw);
        const words = [...code.matchAll(numericWord)];
        const word = (letter: string) =>
            words.find((m) => m[1] === letter)?.[2];
        const m = Number(word('M'));
        const t = word('T');
        if (t !== undefined) {
            tool = Number(t);
            values.toolNumber = tool;
        }
        if (
            !started &&
            code &&
            !['G21', 'G90', 'G17', 'G94'].includes(code) &&
            t === undefined &&
            m !== 6
        ) {
            emit('start');
            if (!context.laser) emit('coolantOn');
            started = true;
            if (pendingOperation) {
                emit('operationStart');
                pendingOperation = false;
            }
        }
        if (m === 2 || m === 30) continue;
        // Request the change; the host/firmware owns the actual procedure.
        if (m === 6 || (t !== undefined && words.length === 1)) {
            if (context.laser) continue;
            if (controller === 'duet') lines.push(`T${tool}`);
            else if (controller === 'grbl' || controller === 'marlin') {
                if (m === 6 && requestedTools.size > 1)
                    throw new Error(
                        `${settings.name}: combined tool-change requests require host support. Export individual toolpaths instead.`,
                    );
            } else lines.push(raw);
            continue;
        }
        if ((m === 3 || m === 4) && !context.laser) {
            values.spindleSpeed = Number(word('S') ?? 0);
            if (
                controller === 'grblhal' &&
                settings.blocks.spindleStart === 'M3 S{spindleSpeed}'
            )
                lines.push(raw);
            else emit('spindleStart');
            if (settings.delaySeconds > 0)
                lines.push(
                    `G4 ${settings.dwell.startsWith('S') ? 'S' : 'P'}${values.delay}`,
                );
            continue;
        }
        if (context.laser && (m === 3 || m === 4)) {
            emit('laserStart');
            laserActive = true;
            continue;
        }
        if (m === 5) {
            emit(context.laser ? 'laserStop' : 'spindleStop');
            laserActive = false;
            continue;
        }
        if (context.laser) {
            const motion = Number(word('G'));
            if (word('S') !== undefined) canonicalPower = Number(word('S'));
            if (motion === 0 && controller === 'duet') lines.push('G1 S0');
            if (motion === 1 && !laserActive) {
                emit('laserStart');
                laserActive = true;
            }
            // Every powered move has its own value in Marlin/Duet; canonical input retains modal S otherwise.
            if (word('S') !== undefined) {
                const power = Number(word('S'));
                if (!Number.isFinite(power) || power < 0 || power > 1000)
                    throw new Error('Laser power must be between 0 and 1000.');
                outputRaw = raw.replace(
                    /S([+-]?(?:\d+\.?\d*|\.\d+))/g,
                    (_word, value: string) =>
                        `S${(Number(value) / 1000) * settings.laserMax}`,
                );
            }
            if (
                ['marlin', 'duet'].includes(controller) &&
                [1, 2, 3].includes(motion) &&
                word('S') === undefined
            ) {
                lines.push(
                    `${outputRaw} S${(canonicalPower / 1000) * settings.laserMax}`,
                );
                continue;
            }
        }
        // Marlin may not implement G21/G17 without optional CNC build features.
        if (!(controller === 'marlin' && (code === 'G21' || code === 'G17')))
            lines.push(outputRaw);
    }
    if (operation) emit('operationEnd');
    if (context.laser && laserActive) emit('laserStop');
    if (!context.laser) emit('coolantOff');
    emit('end');
    let inverse = false;
    const formatted: string[] = [];
    for (const line of lines) {
        const parts = splitComments(line);
        const comments = parts.comments.map(cleanText);
        let code = parts.code;
        const words = [...code.matchAll(numericWord)];
        for (const w of words)
            if (w[1].toUpperCase() === 'G') {
                if (Number(w[2]) === 93) inverse = true;
                if (Number(w[2]) === 94) inverse = false;
            }
        code = code
            .replace(numericWord, (all, letter: string, raw: string) => {
                letter = letter.toUpperCase();
                let value = Number(raw);
                if (!Number.isFinite(value))
                    throw new Error('Non-finite G-code value.');
                if (letter === 'G' && value === 21 && units === 'imperial')
                    return 'G20';
                if (
                    units === 'imperial' &&
                    ('XYZIJKR'.includes(letter) ||
                        (letter === 'F' && !inverse && !context.rotary))
                )
                    value /= 25.4;
                if ('XYZABCIJKRFS'.includes(letter)) {
                    if (letter === 'F' && inverse) return `F${raw}`;
                    if (
                        controller === 'grblhal' &&
                        units === 'metric' &&
                        settings.decimals === 5 &&
                        (!context.laser ||
                            letter !== 'S' ||
                            settings.laserMax === 1000)
                    )
                        return all;
                    return `${letter}${Number(value.toFixed(settings.decimals))}`;
                }
                return all;
            })
            .trim();
        const suffix =
            settings.comments === 'none'
                ? ''
                : comments
                      .map((comment) =>
                          settings.comments === 'semicolon'
                              ? `; ${comment}`
                              : `(${comment})`,
                      )
                      .join(' ');
        if (code || suffix)
            formatted.push([code, suffix].filter(Boolean).join(' '));
    }
    const ending =
        settings.lineEnding === 'CRLF' ||
        (settings.lineEnding === 'source' && canonical.includes('\r\n'))
            ? '\r\n'
            : '\n';
    return formatted.join(ending) + ending;
}
