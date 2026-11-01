import {
    laserRotaryScale,
    validateLaserRotary,
    type LaserRotarySetup,
} from '../cam/laser-rotary.js';

/** Decode actual emitted rotary coordinates to an explicitly unwrapped surface preview. */
export function laserRotaryPreviewLines(
    lines: string[],
    setup: LaserRotarySetup,
) {
    const rotary = validateLaserRotary(setup)!;
    const scale = laserRotaryScale(rotary),
        number = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+))';
    let units = 1,
        absolute = true,
        inverse = false,
        x = 0,
        y = 0;
    return lines.map((line) => {
        let code = line.replace(/\([^)]*\)|;.*$/g, '');
        const word = (letter: string) => {
            const found = code.match(new RegExp(letter + number, 'i'));
            return found ? Number(found[1]) : undefined;
        };
        if (/\bG20\b/.test(code)) units = 25.4;
        if (/\bG21\b/.test(code)) units = 1;
        if (/\bG90(?:\.0+)?(?![\d.])/.test(code)) absolute = true;
        if (/\bG91(?:\.0+)?(?![\d.])/.test(code)) absolute = false;
        if (/\bG93\b/.test(code)) {
            inverse = true;
            code = code.replace(/G93\b/, 'G94');
        } else if (/\bG94\b/.test(code)) inverse = false;
        const nextX = word('X'),
            axis = word(rotary.axis),
            feed = word('F');
        const px = nextX === undefined ? x : (absolute ? 0 : x) + nextX * units;
        const py =
            axis === undefined
                ? y
                : (absolute ? 0 : y) +
                  (axis * (rotary.axis === 'A' ? 1 : units)) / scale;
        if (axis !== undefined)
            code = code.replace(
                new RegExp(rotary.axis + number, 'i'),
                `Y${axis / scale / (rotary.axis === 'A' ? units : 1)}`,
            );
        if (inverse && feed !== undefined && /\bG0?1\b/.test(code))
            code = code.replace(
                new RegExp('F' + number, 'i'),
                `F${(feed * Math.hypot(px - x, py - y)) / units}`,
            );
        x = px;
        y = py;
        return code;
    });
}
