import { GCodeParser } from '@sienci/gviewer';
import type { OutputSettings } from './profiles';

export interface TimingSettings {
    maxSpeed: [number, number, number]; // mm/min, X/Y/Z
    acceleration: [number, number, number]; // mm/s², X/Y/Z
    start: [number, number, number]; // work coordinates, mm
    junctionDeviation: number; // mm
}
export interface TimedPreviewPlan {
    format: 'timing-v1';
    seconds: number;
    lineCount: number;
    blockCount: number;
    chunkSize: number;
    start: [number, number, number];
    // Per block: end time, end X/Y/Z, length, acceleration, entry and peak speed.
    chunks: { values: Float64Array; lines: Uint32Array }[];
}
export interface TimeEstimate {
    seconds: number;
    nominalSeconds: number;
    dwellSeconds: number;
    distanceMm: number;
    moves: number;
    lineEndSeconds: Float64Array;
    playback?: TimedPreviewPlan;
}
const AXES = ['X', 'Y', 'Z'];
const CHUNK = 16384;
const WIDTH = 8;
const LIMIT = 2000000;
const TAU = Math.PI * 2;

/** Offline junction-deviation/trapezoid model, not a firmware emulator. */
export async function estimateProgramTime(
    gcode: string,
    settings: TimingSettings,
    dwell: OutputSettings['dwell'] = 'P-seconds',
    progress: (percent: number) => void = () => {},
    playback = false,
): Promise<TimeEstimate> {
    for (const values of [settings.maxSpeed, settings.acceleration])
        if (
            values.length !== 3 ||
            values.some((v) => !Number.isFinite(v) || v <= 0 || v > 10000000)
        )
            throw new Error('Enter positive axis speeds and accelerations.');
    if (
        settings.start.length !== 3 ||
        settings.start.some(
            (v) => !Number.isFinite(v) || Math.abs(v) > 10000000,
        ) ||
        !Number.isFinite(settings.junctionDeviation) ||
        settings.junctionDeviation < 0 ||
        settings.junctionDeviation > 10
    )
        throw new Error('Invalid start position or corner accuracy.');
    if (gcode.length > 128 * 1024 * 1024)
        throw new Error('Program exceeds the timing input budget.');
    const lines = gcode.split(/\r?\n/);
    if (lines.length > LIMIT)
        throw new Error('Time estimate exceeds the two-million-line limit.');
    const chunks: { values: Float64Array; lines: Uint32Array }[] = [];
    let count = 0,
        distanceMm = 0,
        nominalSeconds = 0,
        dwellSeconds = 0;
    // length, unit X/Y/Z, speed, acceleration, squared entry speed, dwell
    const get = (i: number, field: number) =>
        chunks[Math.floor(i / CHUNK)].values[(i % CHUNK) * WIDTH + field];
    const set = (i: number, field: number, value: number) => {
        chunks[Math.floor(i / CHUNK)].values[(i % CHUNK) * WIDTH + field] =
            value;
    };
    const append = (values: number[], line: number) => {
        if (count >= LIMIT)
            throw new Error(
                'Time estimate exceeds the two-million-move limit.',
            );
        if (count % CHUNK === 0)
            chunks.push({
                values: new Float64Array(CHUNK * WIDTH),
                lines: new Uint32Array(CHUNK),
            });
        const chunk = chunks[Math.floor(count / CHUNK)],
            offset = count % CHUNK;
        chunk.values.set(values, offset * WIDTH);
        chunk.lines[offset] = line;
        count++;
    };
    const barrier = (line: number, seconds = 0) => {
        if (seconds || (count && get(count - 1, 0)))
            append([0, 0, 0, 0, 0, 1, 0, seconds], line);
        dwellSeconds += seconds;
        nominalSeconds += seconds;
        if (!Number.isFinite(dwellSeconds) || !Number.isFinite(nominalSeconds))
            throw new Error('Dwell exceeds timing numeric precision.');
    };
    const move = (from: number[], to: number[], feed: number, line: number) => {
        const delta = to.map((v, i) => v - from[i]),
            length = Math.hypot(...delta);
        if (!Number.isFinite(length))
            throw new Error('Invalid motion coordinates.');
        if (length < 1e-10) return;
        const unit = delta.map((v) => v / length);
        let speed = feed / 60,
            accel = Infinity;
        for (let axis = 0; axis < 3; axis++)
            if (Math.abs(unit[axis]) > 1e-12) {
                speed = Math.min(
                    speed,
                    settings.maxSpeed[axis] / 60 / Math.abs(unit[axis]),
                );
                accel = Math.min(
                    accel,
                    settings.acceleration[axis] / Math.abs(unit[axis]),
                );
            }
        if (!Number.isFinite(speed) || speed <= 0)
            throw new Error('Motion has no positive feed rate.');
        let entry = 0;
        if (count && get(count - 1, 0) && settings.junctionDeviation > 0) {
            const dot = Math.max(
                -1,
                Math.min(
                    1,
                    unit.reduce(
                        (sum, value, axis) =>
                            sum + value * get(count - 1, axis + 1),
                        0,
                    ),
                ),
            );
            const limit = Math.min(speed, get(count - 1, 4));
            if (dot > 0.999999) entry = limit * limit;
            else if (dot > -0.999999) {
                const sine = Math.sqrt((1 + dot) / 2);
                entry = Math.min(
                    limit * limit,
                    (Math.min(accel, get(count - 1, 5)) *
                        settings.junctionDeviation *
                        sine) /
                        (1 - sine),
                );
            }
        }
        append([length, ...unit, speed, accel, entry, 0], line);
        distanceMm += length;
        nominalSeconds += length / speed;
        if (!Number.isFinite(nominalSeconds))
            throw new Error('Motion exceeds timing numeric precision.');
    };
    const parser = new GCodeParser();
    let position = [...settings.start],
        scale = 1,
        absolute = true,
        motion = 0,
        feed = 0,
        plane = 17;
    let ended = false;
    for (let line = 0; line < lines.length; line++) {
        if (ended) break;
        const code = lines[line]
            .replace(/\([^)]*\)|;.*$/g, '')
            .trim()
            .toUpperCase();
        if (!code || code === '%') continue;
        const parsed = parser.parseLine(code),
            words = parsed.words;
        const seen = new Set<string>();
        const groups = new Set<string>();
        for (const word of words) {
            const letter = word.letter;
            if ('XYZFIJKRPSN'.includes(letter)) {
                if (seen.has(letter))
                    throw new Error(
                        'Repeated ' +
                            letter +
                            ' word on line ' +
                            (line + 1) +
                            '.',
                    );
                seen.add(letter);
            }
            if (letter === 'G') {
                const g = word.value;
                const group = [0, 1, 2, 3].includes(g)
                    ? 'motion'
                    : [17, 18, 19].includes(g)
                      ? 'plane'
                      : [20, 21].includes(g)
                        ? 'units'
                        : [90, 91].includes(g)
                          ? 'distance'
                          : '';
                if (group && groups.has(group))
                    throw new Error(
                        'Conflicting G-code modes on line ' + (line + 1) + '.',
                    );
                if (group) groups.add(group);
            }
        }
        let remainder = code;
        for (const word of [...words].reverse())
            remainder =
                remainder.slice(0, word.start) + remainder.slice(word.end);
        // Marlin continuous-inline laser mode has a bare I on M3/M4.
        if (words.some((w) => w.letter === 'M' && [3, 4].includes(w.value)))
            remainder = remainder.replace(/\bI\b/g, '');
        if (remainder.trim())
            throw new Error(
                'Unsupported expression on line ' + (line + 1) + '.',
            );
        let explicitMotion = false,
            pause = false;
        for (const word of words) {
            if (!Number.isFinite(word.value))
                throw new Error(
                    'Invalid numeric word on line ' + (line + 1) + '.',
                );
            if (word.letter === 'G') {
                const g = word.value;
                if ([0, 1, 2, 3].includes(g)) {
                    motion = g;
                    explicitMotion = true;
                } else if (g === 4) pause = true;
                else if ([17, 18, 19].includes(g)) plane = g;
                else if (g === 20) scale = 25.4;
                else if (g === 21) scale = 1;
                else if (g === 90) absolute = true;
                else if (g === 91) absolute = false;
                else if (![54, 91.1, 94].includes(g))
                    throw new Error(
                        'Time estimate does not support G' +
                            g +
                            ' (line ' +
                            (line + 1) +
                            ').',
                    );
            } else if (word.letter === 'M') {
                if ([2, 30].includes(word.value)) ended = true;
                else if ([3, 4, 5, 7, 8, 9, 400].includes(word.value))
                    barrier(line);
                else
                    throw new Error(
                        'Time estimate does not support M' +
                            word.value +
                            ' (line ' +
                            (line + 1) +
                            ').',
                    );
            } else if (!'XYZFIJKRPSN'.includes(word.letter))
                throw new Error(
                    'Time estimate does not support ' +
                        word.letter +
                        ' (line ' +
                        (line + 1) +
                        ').',
                );
        }
        const word = (letter: string) =>
            words.find((w) => w.letter === letter)?.value;
        const f = word('F');
        if (f !== undefined) {
            feed = f * scale;
            if (!Number.isFinite(feed) || feed <= 0)
                throw new Error(
                    'Feed must be positive (line ' + (line + 1) + ').',
                );
        }
        if (pause) {
            if (explicitMotion || AXES.some((axis) => word(axis) !== undefined))
                throw new Error(
                    'Mixed dwell and motion on line ' + (line + 1) + '.',
                );
            const p = word('P'),
                s = word('S');
            const value = dwell === 'S-seconds' ? s : p;
            if (
                value === undefined ||
                value < 0 ||
                (dwell === 'S-seconds' ? p !== undefined : s !== undefined)
            )
                throw new Error(
                    'Dwell does not match the selected controller units (line ' +
                        (line + 1) +
                        ').',
                );
            barrier(line, value / (dwell === 'P-milliseconds' ? 1000 : 1));
        } else if (
            AXES.some((axis) => word(axis) !== undefined) ||
            ([2, 3].includes(motion) &&
                (explicitMotion ||
                    ['I', 'J', 'K', 'R'].some(
                        (axis) => word(axis) !== undefined,
                    )))
        ) {
            const end = position.map((value, axis) => {
                const v = word(AXES[axis]);
                return v === undefined
                    ? value
                    : v * scale + (absolute ? 0 : value);
            });
            if (
                end.some(
                    (value) =>
                        !Number.isFinite(value) || Math.abs(value) > 10000000,
                )
            )
                throw new Error('Motion exceeds the timing coordinate budget.');
            if (motion < 2) {
                if (
                    ['I', 'J', 'K', 'R'].some(
                        (axis) => word(axis) !== undefined,
                    )
                )
                    throw new Error(
                        'Arc parameters on a linear move (line ' +
                            (line + 1) +
                            ').',
                    );
                move(position, end, motion === 0 ? Infinity : feed, line);
            } else {
                const axes =
                    plane === 17
                        ? [0, 1, 2]
                        : plane === 18
                          ? [2, 0, 1]
                          : [1, 2, 0];
                const [u, v, w] = axes,
                    letters = ['I', 'J', 'K'];
                let cu = position[u] + (word(letters[u]) ?? 0) * scale;
                let cv = position[v] + (word(letters[v]) ?? 0) * scale;
                const r = word('R');
                if (r !== undefined) {
                    if (
                        word(letters[u]) !== undefined ||
                        word(letters[v]) !== undefined
                    )
                        throw new Error(
                            'Ambiguous arc centre on line ' + (line + 1) + '.',
                        );
                    const dx = end[u] - position[u],
                        dy = end[v] - position[v],
                        chord = Math.hypot(dx, dy),
                        radius = Math.abs(r * scale);
                    if (!chord || radius < chord / 2)
                        throw new Error(
                            'Invalid radius arc on line ' + (line + 1) + '.',
                        );
                    const h = Math.sqrt(
                        Math.max(0, radius * radius - (chord * chord) / 4),
                    );
                    const side = (motion === 3 ? 1 : -1) * (r < 0 ? -1 : 1);
                    cu = (position[u] + end[u]) / 2 - (side * dy * h) / chord;
                    cv = (position[v] + end[v]) / 2 + (side * dx * h) / chord;
                }
                const radius = Math.hypot(position[u] - cu, position[v] - cv);
                if (
                    !radius ||
                    Math.abs(Math.hypot(end[u] - cu, end[v] - cv) - radius) >
                        Math.max(0.002, radius * 0.001)
                )
                    throw new Error(
                        'Invalid arc centre on line ' + (line + 1) + '.',
                    );
                const startAngle = Math.atan2(
                    position[v] - cv,
                    position[u] - cu,
                );
                let sweep = Math.atan2(end[v] - cv, end[u] - cu) - startAngle;
                if (motion === 3) {
                    if (sweep <= 1e-12) sweep += TAU;
                } else if (sweep >= -1e-12) sweep -= TAU;
                const turns = word('P') ?? 1;
                if (!Number.isSafeInteger(turns) || turns < 1)
                    throw new Error(
                        'Arc requires a positive integer turn count.',
                    );
                sweep += (motion === 3 ? 1 : -1) * TAU * (turns - 1);
                // shortcut: 0.01 mm / 1° chords approximate arc dynamics; upgrade for firmware-matched arc timing.
                const step = Math.min(
                    Math.PI / 180,
                    2 * Math.acos(Math.max(-1, 1 - 0.01 / radius)),
                );
                const segments = Math.ceil(
                    Math.abs(sweep) / Math.max(1e-9, step),
                );
                if (segments > 100000)
                    throw new Error(
                        'Arc exceeds the timing resolution budget.',
                    );
                let previous = position;
                for (let i = 1; i <= segments; i++) {
                    const next = [...position],
                        angle = startAngle + (sweep * i) / segments;
                    next[u] = cu + radius * Math.cos(angle);
                    next[v] = cv + radius * Math.sin(angle);
                    next[w] =
                        position[w] + ((end[w] - position[w]) * i) / segments;
                    if (i === segments)
                        for (let axis = 0; axis < 3; axis++)
                            next[axis] = end[axis];
                    const arcFeed = Math.min(
                        feed,
                        60 *
                            Math.sqrt(
                                Math.min(
                                    settings.acceleration[u],
                                    settings.acceleration[v],
                                ) * radius,
                            ),
                    );
                    move(previous, next, arcFeed, line);
                    previous = next;
                }
            }
            position = end;
        }
        if ((line & 4095) === 0) {
            progress(Math.floor((60 * line) / lines.length));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    let nextEntry = 0;
    for (let i = count - 1; i >= 0; i--) {
        const entry = Math.min(
            get(i, 6),
            nextEntry + 2 * get(i, 5) * get(i, 0),
        );
        set(i, 6, entry);
        nextEntry = entry;
    }
    for (let i = 1; i < count; i++)
        set(
            i,
            6,
            Math.min(
                get(i, 6),
                get(i - 1, 6) + 2 * get(i - 1, 5) * get(i - 1, 0),
            ),
        );
    const lineEndSeconds = new Float64Array(lines.length);
    let seconds = 0;
    const cursorPosition = [...settings.start];
    for (let i = 0; i < count; i++) {
        const length = get(i, 0),
            acceleration = get(i, 5);
        let entry = 0,
            peak = 0;
        let duration = get(i, 7);
        if (length) {
            entry = Math.sqrt(get(i, 6));
            const exit = Math.sqrt(i + 1 < count ? get(i + 1, 6) : 0);
            peak = Math.sqrt(
                Math.min(
                    get(i, 4) ** 2,
                    acceleration * length + (entry * entry + exit * exit) / 2,
                ),
            );
            if (!Number.isFinite(peak) || peak <= 0)
                throw new Error('Motion exceeds timing numeric precision.');
            const ramps =
                (2 * peak * peak - entry * entry - exit * exit) /
                (2 * acceleration);
            duration =
                (2 * peak - entry - exit) / acceleration +
                Math.max(0, length - ramps) / peak;
        }
        const nextTime = seconds + duration;
        if (
            !Number.isFinite(nextTime) ||
            !Number.isFinite(duration) ||
            duration < 0 ||
            (length > 0 && duration === 0) ||
            (duration > 0 && nextTime <= seconds)
        )
            throw new Error('Program exceeds timing numeric precision.');
        seconds = nextTime;
        lineEndSeconds[chunks[Math.floor(i / CHUNK)].lines[i % CHUNK]] =
            seconds;
        if (playback) {
            for (let axis = 0; axis < 3; axis++)
                cursorPosition[axis] += get(i, axis + 1) * length;
            const values = [
                seconds,
                ...cursorPosition,
                length,
                acceleration,
                entry,
                peak,
            ];
            for (let field = 0; field < WIDTH; field++)
                set(i, field, values[field]);
        }
        if ((i & 16383) === 0) {
            progress(60 + Math.floor((40 * i) / Math.max(1, count)));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    for (let line = 1; line < lines.length; line++)
        lineEndSeconds[line] = Math.max(
            lineEndSeconds[line],
            lineEndSeconds[line - 1],
        );
    return {
        seconds,
        nominalSeconds,
        dwellSeconds,
        distanceMm,
        moves: count,
        lineEndSeconds,
        ...(playback
            ? {
                  playback: {
                      format: 'timing-v1' as const,
                      seconds,
                      lineCount: lines.length,
                      blockCount: count,
                      chunkSize: CHUNK,
                      start: [...settings.start] as [number, number, number],
                      chunks: chunks.map((chunk, index) => {
                          const used = Math.min(CHUNK, count - index * CHUNK);
                          return used === CHUNK
                              ? chunk
                              : {
                                    values: chunk.values.slice(0, used * WIDTH),
                                    lines: chunk.lines.slice(0, used),
                                };
                      }),
                  },
              }
            : {}),
    };
}
