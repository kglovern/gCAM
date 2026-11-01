import { GCodeParser } from '@sienci/gviewer';
import type { OutputSettings } from './profiles';

type FocusContract = {
    mode: 'ramp' | 'sweep';
    stockBounds: { minX: number; maxX: number; minY: number; maxY: number };
    minZMm: number;
    maxZMm: number;
    travelZMm: number;
    zFeedMmMin: number;
    stepMm: number;
};

/** Check the actual rendered calibration file, including user command blocks and output rounding. */
export function validateFocusProgram(
    code: string,
    toolpaths: Record<string, unknown>[],
    settings: OutputSettings,
) {
    if (!toolpaths.some((path) => path.laserFocusTest)) return;
    if (toolpaths.length !== 1 || !toolpaths[0].laserFocusTest)
        throw new Error('Export focus tests separately from other operations.');
    const focus = toolpaths[0].laserFocusTest as FocusContract;
    const parser = new GCodeParser();
    let scale = 1,
        absolute = true,
        motion = 0,
        power = 0,
        feed = 0;
    let x: number | undefined, y: number | undefined, z: number | undefined;
    const tolerance = 1e-7;
    const rounding = () =>
        0.00005 + (10 ** -settings.decimals * scale) / 2 + tolerance;
    const inRange = (value: number, min: number, max: number) =>
        Number.isFinite(value) &&
        value >= min - rounding() &&
        value <= max + rounding();
    for (const raw of code.split(/\r?\n/)) {
        const line = raw
            .replace(/\([^)]*\)|;.*$/g, '')
            .trim()
            .toUpperCase();
        if (!line) continue;
        const words = parser.parseLine(line).words;
        let rest = line;
        for (const word of [...words].reverse())
            rest = rest.slice(0, word.start) + rest.slice(word.end);
        const ms = words
            .filter((word) => word.letter === 'M')
            .map((word) => word.value);
        if (ms.some((m) => [3, 4, 5].includes(m)))
            rest = rest.replace(/\bI\b/g, '');
        if (rest.trim())
            throw new Error(
                'Focus test cannot verify expressions or custom program commands.',
            );
        const seen = new Set<string>();
        for (const word of words) {
            if (
                !'NGMXYZFSP'.includes(word.letter) ||
                !Number.isFinite(word.value)
            )
                throw new Error(
                    'Focus test contains an unsupported parameter.',
                );
            if (!['G', 'M'].includes(word.letter) && seen.has(word.letter))
                throw new Error('Focus test contains duplicate parameters.');
            seen.add(word.letter);
        }
        let dwell = false;
        for (const word of words) {
            if (word.letter === 'G') {
                const g = word.value;
                if ([0, 1].includes(g)) motion = g;
                else if (g === 4) dwell = true;
                else if (g === 20) scale = 25.4;
                else if (g === 21) scale = 1;
                else if (g === 90) absolute = true;
                else if (g === 91) absolute = false;
                else if (![17, 91.1, 94].includes(g))
                    throw new Error(
                        'Focus test cannot verify G' +
                            g +
                            ' in command blocks.',
                    );
            }
            if (
                word.letter === 'M' &&
                ![2, 3, 4, 5, 7, 8, 9, 30, 400].includes(word.value) &&
                !(
                    settings.controller === 'marlin' &&
                    [106, 107].includes(word.value)
                ) &&
                !(settings.controller === 'duet' && word.value === 452)
            )
                throw new Error(
                    'Focus test cannot verify M' +
                        word.value +
                        ' in command blocks.',
                );
        }
        const word = (letter: string) =>
            words.find((word) => word.letter === letter)?.value;
        const s = word('S'),
            f = word('F'),
            px = word('X'),
            py = word('Y'),
            pz = word('Z');
        if (f !== undefined) {
            feed = f * scale;
            if (!Number.isFinite(feed) || feed <= 0)
                throw new Error('Focus test needs a finite positive feed.');
        }
        if (ms.includes(5)) power = 0;
        const laserPowerWord =
            !dwell && (ms.length === 0 || ms.some((m) => [3, 4].includes(m)));
        if (s !== undefined && laserPowerWord) power = s;
        if (ms.some((m) => [3, 4].includes(m)) && power !== 0)
            throw new Error(
                'Focus-test start commands must leave laser power at zero.',
            );
        if (
            !Number.isFinite(power) ||
            power < 0 ||
            power > settings.laserMax + tolerance
        )
            throw new Error('Invalid power in rendered focus test.');
        if (pz !== undefined) {
            if (focus.mode === 'ramp')
                throw new Error(
                    'Manual ramp test cannot include Z moves from command blocks.',
                );
            if (
                !absolute ||
                motion !== 1 ||
                dwell ||
                px !== undefined ||
                py !== undefined ||
                power !== 0 ||
                !(feed > 0 && feed <= focus.zFeedMmMin + rounding())
            )
                throw new Error(
                    'Focus Z moves require absolute G1, zero power and the configured Z feed.',
                );
            z = pz * scale;
            if (!inRange(z, focus.minZMm, focus.maxZMm))
                throw new Error(
                    'Rendered Z exceeds the focus work range; check command blocks or coordinate precision.',
                );
        }
        if (px !== undefined) {
            if (!absolute && x === undefined)
                throw new Error('Focus test needs a known XY work position.');
            x = px * scale + (absolute ? 0 : x!);
            if (!inRange(x, focus.stockBounds.minX, focus.stockBounds.maxX))
                throw new Error('Focus X move is outside stock.');
        }
        if (py !== undefined) {
            if (!absolute && y === undefined)
                throw new Error('Focus test needs a known XY work position.');
            y = py * scale + (absolute ? 0 : y!);
            if (!inRange(y, focus.stockBounds.minY, focus.stockBounds.maxY))
                throw new Error('Focus Y move is outside stock.');
        }
        if (power > 0) {
            if (dwell || motion !== 1)
                throw new Error(
                    'Focus power requires a linear marking move without dwell.',
                );
            if (px === undefined && py === undefined)
                throw new Error('Focus power requires an XY marking move.');
            if (!(feed > 0) || x === undefined || y === undefined)
                throw new Error(
                    'Focus marking move needs a feed and known XY position.',
                );
            if (
                focus.mode === 'sweep' &&
                (z === undefined || !inRange(z, focus.minZMm, focus.maxZMm))
            )
                throw new Error('Focus marking requires a configured work Z.');
        }
    }
    if (power !== 0)
        throw new Error('Focus test must finish with zero laser power.');
    if (
        focus.mode === 'sweep' &&
        (z === undefined || Math.abs(z - focus.travelZMm) > rounding())
    )
        throw new Error(
            'Focus test must finish at its stated travel/return Z; check coordinate precision.',
        );
}
