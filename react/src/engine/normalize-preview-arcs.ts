import { GCodeParser, GCodeVirtualizer } from '@sienci/gviewer';
import type { ArcMoveCallback } from '@sienci/gviewer';

export const PREVIEW_ARC_SEGMENTS = 30;
const LIMIT = 4000000;
const CENTRE = { X: 'I', Y: 'J', Z: 'K' } as const;
type Axis = keyof typeof CENTRE;

function decimal(value: number) {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e21)
        throw new Error('Arc coordinates exceed preview numeric precision.');
    const result = value.toFixed(15).replace(/\.?0+$/, '');
    return result;
}

/** Work around coincident-endpoint and decimal arc-mode limitations in the viewer parser only. */
export async function normalizePreviewArcs(input: string[]) {
    // Linear/raster files avoid an additional modal parse and line-map allocation.
    let arcMode = false;
    const hasArcs = input.some((line) => {
        if (/\bG9[01]\.10*(?![\d.])/i.test(line)) arcMode = true;
        return /\bG0?[23](?:\.0*)?(?![\d.])/i.test(line);
    });
    if (!hasArcs)
        return {
            lines: arcMode
                ? input.map((line) =>
                      line.replace(/\bG9[01]\.10*(?![\d.])/gi, ''),
                  )
                : input,
            sourceEnds: undefined,
        };
    const arcInfo: Parameters<ArcMoveCallback>[0][] = [];
    const parser = new GCodeParser(),
        virtualizer = new GCodeVirtualizer({
            onArcMove: (arc) => {
                arcInfo[0] = arc;
            },
        });
    const lines: string[] = [],
        sourceEnds = new Uint32Array(input.length);
    let absoluteCentres = false,
        vertices = 0;
    for (let index = 0; index < input.length; index++) {
        const parsed = parser.parseLine(input[index]);
        let changed = false;
        for (const word of parsed.gcodes) {
            if (word.letter === 'G' && [90.1, 91.1].includes(word.value)) {
                absoluteCentres = word.value === 90.1;
                changed = true;
            }
        }
        const before = virtualizer.getPosition(),
            modals = virtualizer.getModals();
        let units = modals.units;
        let motion = modals.motion;
        for (const word of parsed.gcodes)
            if (word.letter === 'G') {
                if ([20, 21].includes(word.value))
                    units = word.value === 20 ? 'G20' : 'G21';
                if ([0, 1, 2, 3].includes(word.value))
                    motion = ('G' + word.value) as typeof motion;
            }
        const scale = units === 'G20' ? 25.4 : 1;
        const normalized = parsed.words
            .filter(
                (word) =>
                    !(word.letter === 'G' && [90.1, 91.1].includes(word.value)),
            )
            .map((word) => {
                if (
                    absoluteCentres &&
                    ['G2', 'G3'].includes(motion) &&
                    ['I', 'J', 'K'].includes(word.letter)
                ) {
                    changed = true;
                    const axis =
                        word.letter === 'I'
                            ? 'X'
                            : word.letter === 'J'
                              ? 'Y'
                              : 'Z';
                    return (
                        word.letter + decimal(word.value - before[axis] / scale)
                    );
                }
                return word.raw;
            })
            .join(' ');
        arcInfo.length = 0;
        const result = virtualizer.processLine(
            changed ? normalized : input[index],
        );
        const explicitArc = result.parsed.gcodes.some(
            (word) => word.letter === 'G' && [2, 3].includes(word.value),
        );
        const suppressed =
            !explicitArc &&
            result.parsed.gcodes.some(
                (word) => word.letter === 'M' || word.value === 4,
            );
        const hasCoordinates = result.parsed.params.some((word) =>
            'XYZIJKR'.includes(word.letter),
        );
        const arcMotion =
            !suppressed &&
            ['G2', 'G3'].includes(result.modals.motion) &&
            (explicitArc || hasCoordinates);
        const word = (letter: string) =>
            result.parsed.params.find((word) => word.letter === letter)?.value;
        const turns = arcMotion ? (word('P') ?? 1) : 1;
        if (!Number.isSafeInteger(turns) || turns < 1)
            throw new Error(
                'Arc preview requires a positive integer turn count.',
            );
        if (arcMotion && (result.movement === 'none' || turns > 1)) {
            const [u, v]: [Axis, Axis] =
                result.modals.plane === 'G18'
                    ? ['Z', 'X']
                    : result.modals.plane === 'G19'
                      ? ['Y', 'Z']
                      : ['X', 'Y'];
            let centre = arcInfo[0]?.center;
            if (!centre) {
                if (word('R') !== undefined)
                    throw new Error(
                        'Full-circle preview requires I/J/K centre offsets, not R.',
                    );
                const du = word(CENTRE[u]) ?? 0,
                    dv = word(CENTRE[v]) ?? 0;
                if (
                    !Number.isFinite(du) ||
                    !Number.isFinite(dv) ||
                    !Math.hypot(du, dv)
                )
                    throw new Error('Invalid full-circle centre for preview.');
                if (
                    Number(du.toFixed(15)) === 0 &&
                    Number(dv.toFixed(15)) === 0
                )
                    throw new Error(
                        'Full-circle radius is below preview numeric precision.',
                    );
                centre = {
                    ...result.start,
                    [u]: result.start[u] + du * scale,
                    [v]: result.start[v] + dv * scale,
                };
                if (
                    centre[u] === result.start[u] &&
                    centre[v] === result.start[v]
                )
                    throw new Error(
                        'Full-circle radius is below preview numeric precision.',
                    );
            }
            const radius = Math.hypot(
                result.start[u] - centre[u],
                result.start[v] - centre[v],
            );
            const startAngle = Math.atan2(
                result.start[v] - centre[v],
                result.start[u] - centre[u],
            );
            let sweep =
                Math.atan2(
                    result.end[v] - centre[v],
                    result.end[u] - centre[u],
                ) - startAngle;
            const direction = result.modals.motion === 'G3' ? 1 : -1;
            if (direction === 1 && sweep <= 1e-12) sweep += Math.PI * 2;
            if (direction === -1 && sweep >= -1e-12) sweep -= Math.PI * 2;
            sweep += direction * Math.PI * 2 * (turns - 1);
            const pieces = Math.ceil(Math.abs(sweep) / Math.PI);
            if (
                !Number.isFinite(radius) ||
                !radius ||
                !Number.isSafeInteger(pieces) ||
                lines.length + pieces > 2000000 ||
                vertices + pieces * PREVIEW_ARC_SEGMENTS * 2 > LIMIT
            )
                throw new Error(
                    'Arc preview exceeds its line or vertex budget.',
                );
            const absolute = result.modals.distance === 'G90';
            const base = result.parsed.words
                .filter(
                    (word) =>
                        !'XYZABCIJKRNP'.includes(word.letter) &&
                        !(word.letter === 'G' && [2, 3].includes(word.value)),
                )
                .map((word) => word.raw)
                .join(' ');
            let previous = result.start;
            for (let part = 1; part <= pieces; part++) {
                const end = { ...result.start };
                const fraction = part / pieces,
                    angle = startAngle + sweep * fraction;
                for (const axis of ['X', 'Y', 'Z', 'A', 'B', 'C'] as const)
                    end[axis] +=
                        (result.end[axis] - result.start[axis]) * fraction;
                end[u] = centre[u] + radius * Math.cos(angle);
                end[v] = centre[v] + radius * Math.sin(angle);
                if (part === pieces) Object.assign(end, result.end);
                const axes = (['X', 'Y', 'Z', 'A', 'B', 'C'] as const).filter(
                    (axis) =>
                        'XYZ'.includes(axis) ||
                        result.start[axis] !== result.end[axis],
                );
                const coordinates = axes
                    .map(
                        (axis) =>
                            axis +
                            decimal(
                                (end[axis] - (absolute ? 0 : previous[axis])) /
                                    ('XYZ'.includes(axis) ? scale : 1),
                            ),
                    )
                    .join(' ');
                lines.push(
                    (part === 1 ? base + ' ' : '') +
                        result.modals.motion +
                        ' ' +
                        coordinates +
                        ' ' +
                        CENTRE[u] +
                        decimal((centre[u] - previous[u]) / scale) +
                        ' ' +
                        CENTRE[v] +
                        decimal((centre[v] - previous[v]) / scale),
                );
                previous = end;
            }
            vertices += pieces * PREVIEW_ARC_SEGMENTS * 2;
        } else {
            lines.push(changed ? normalized : input[index]);
            vertices +=
                result.movement === 'arc'
                    ? PREVIEW_ARC_SEGMENTS * 2
                    : result.movement === 'linear'
                      ? 2
                      : 0;
        }
        if (lines.length > 2000000 || vertices > LIMIT)
            throw new Error('Arc preview exceeds its line or vertex budget.');
        sourceEnds[index] = lines.length - 1;
        if ((index & 4095) === 0)
            await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { lines, sourceEnds };
}
