import { FONT_OPTIONS, outlineTextLoops, textLoops } from './textGeometry';

export type GeneratorKind = 'slot' | 'ellipse' | 'rounded-rectangle' | 'clock';
export type GeneratedLoop = { points: { x: number; y: number }[] };
export interface GeneratorOptions {
    x: number;
    y: number;
    endX: number;
    endY: number;
    width: number;
    height: number;
    radius: number;
    diameter: number;
    font: string;
}
export const GENERATOR_NAMES: Record<GeneratorKind, string> = {
    slot: 'Slot',
    ellipse: 'Ellipse',
    'rounded-rectangle': 'Rounded Rectangle',
    clock: 'Clock Face',
};
const arc = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    start: number,
    sweep: number,
    segments = 32,
) => {
    // Keep sampled curve error below 0.02 mm, including large clock faces.
    const radius = Math.max(rx, ry, 0.02);
    const required = Math.abs(sweep) / (2 * Math.acos(1 - 0.02 / radius));
    const count = Math.max(segments, Math.ceil(required / 4) * 4);
    return Array.from({ length: count + 1 }, (_, i) => {
        const angle = start + (sweep * i) / count;
        return { x: x + rx * Math.cos(angle), y: y + ry * Math.sin(angle) };
    });
};
const close = (points: GeneratedLoop['points']) => ({
    points: [...points, { ...points[0] }],
});
export async function generateShape(
    kind: GeneratorKind,
    o: GeneratorOptions,
): Promise<GeneratedLoop[]> {
    const positive = (value: number) =>
        Number.isFinite(value) && value > 0 && value <= 2000;
    if (![o.x, o.y, o.endX, o.endY].every(Number.isFinite))
        throw new Error('Enter finite coordinates.');
    if (kind === 'clock') {
        if (!positive(o.diameter) || o.diameter < 20)
            throw new Error('Use a clock diameter from 20 to 2000 mm.');
        if (!FONT_OPTIONS.some((font: { id: string }) => font.id === o.font))
            throw new Error('Choose a font.');
        const r = o.diameter / 2;
        const loops = [
            close(arc(0, 0, r, r, 0, Math.PI * 2, 128).slice(0, -1)),
        ];
        for (let hour = 1; hour <= 12; hour++) {
            const label = String(hour);
            const height = o.diameter * 0.075;
            const glyphs =
                o.font === 'single-line'
                    ? textLoops(label, { x: 0, y: 0 }, height)
                    : await outlineTextLoops(
                          label,
                          { x: 0, y: 0 },
                          height,
                          o.font,
                      );
            const points = glyphs.flatMap((loop) => loop.points);
            if (!points.length)
                throw new Error('The selected font has no clock numerals.');
            const cx =
                (Math.min(...points.map((p) => p.x)) +
                    Math.max(...points.map((p) => p.x))) /
                2;
            const cy =
                (Math.min(...points.map((p) => p.y)) +
                    Math.max(...points.map((p) => p.y))) /
                2;
            const angle = Math.PI / 2 - (hour * Math.PI) / 6;
            loops.push(
                ...glyphs.map((loop) => ({
                    points: loop.points.map((p) => ({
                        x: p.x - cx + r * 0.76 * Math.cos(angle),
                        y: p.y - cy + r * 0.76 * Math.sin(angle),
                    })),
                })),
            );
        }
        return loops;
    }
    return basicShapeLoops(kind, o);
}

export function basicShapeLoops(
    kind: Exclude<GeneratorKind, 'clock'>,
    o: GeneratorOptions,
): GeneratedLoop[] {
    const positive = (value: number) =>
        Number.isFinite(value) && value > 0 && value <= 2000;
    if (!positive(o.width))
        throw new Error(
            'Use a width greater than zero and no more than 2000 mm.',
        );
    if (kind === 'slot') {
        const length = Math.hypot(o.endX - o.x, o.endY - o.y);
        if (length < 0.01) throw new Error('Choose two different end centres.');
        const angle = Math.atan2(o.endY - o.y, o.endX - o.x);
        const r = o.width / 2;
        return [
            close([
                ...arc(o.endX, o.endY, r, r, angle - Math.PI / 2, Math.PI),
                ...arc(o.x, o.y, r, r, angle + Math.PI / 2, Math.PI),
            ]),
        ];
    }
    if (!positive(o.height))
        throw new Error(
            'Use a height greater than zero and no more than 2000 mm.',
        );
    if (kind === 'ellipse')
        return [
            close(
                arc(
                    o.x,
                    o.y,
                    o.width / 2,
                    o.height / 2,
                    0,
                    Math.PI * 2,
                    128,
                ).slice(0, -1),
            ),
        ];
    if (
        !Number.isFinite(o.radius) ||
        o.radius < 0 ||
        o.radius > Math.min(o.width, o.height) / 2
    )
        throw new Error(
            'Corner radius must fit inside half the width and height.',
        );
    const x = o.width / 2,
        y = o.height / 2,
        r = o.radius;
    return [
        close([
            ...arc(o.x + x - r, o.y + y - r, r, r, 0, Math.PI / 2, 16),
            ...arc(
                o.x - x + r,
                o.y + y - r,
                r,
                r,
                Math.PI / 2,
                Math.PI / 2,
                16,
            ),
            ...arc(o.x - x + r, o.y - y + r, r, r, Math.PI, Math.PI / 2, 16),
            ...arc(
                o.x + x - r,
                o.y - y + r,
                r,
                r,
                Math.PI * 1.5,
                Math.PI / 2,
                16,
            ),
        ]),
    ];
}
