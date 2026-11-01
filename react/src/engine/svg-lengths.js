import { createMatrix } from '../geometry/matrix.js';
const UNITS = {
    px: 1,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
    pt: 96 / 72,
    pc: 16,
};
export function svgLengthValue(text, percentageBase = 0) {
    if (text == null || !text.trim() || text.trim() === 'auto') return null;
    const match = text
        .trim()
        .match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([%a-z]*)$/i);
    if (!match) {
        if (/(?:calc|var|min|max|clamp)\(/i.test(text))
            throw new Error('Unsupported SVG length expression.');
        return null;
    }
    const value = Number(match[1]),
        unit = match[2].toLowerCase();
    if (!Number.isFinite(value)) throw new Error('Invalid SVG length.');
    if (
        unit &&
        unit !== '%' &&
        !Object.prototype.hasOwnProperty.call(UNITS, unit)
    )
        throw new Error(`Unsupported SVG length unit: ${unit}.`);
    const result = !unit
        ? value
        : unit === '%'
          ? (value / 100) * percentageBase
          : value * UNITS[unit];
    if (!Number.isFinite(result)) throw new Error('Invalid SVG length.');
    return result;
}
export function svgLengthReader() {
    const viewports = new WeakMap();
    const viewport = (element) => {
        const owner =
            element.localName.toLowerCase() === 'svg'
                ? element
                : element.closest('svg');
        if (!owner) return { x: 300, y: 150 };
        if (viewports.has(owner)) return viewports.get(owner);
        const parent = owner.parentElement?.closest('svg');
        const base = parent ? viewport(parent) : { x: 300, y: 150 };
        const box = svgViewBox(owner);
        const result = parent
            ? nestedSvgViewport(owner, base).size
            : box && box[2] > 0 && box[3] > 0
              ? { x: box[2], y: box[3] }
              : {
                    x:
                        svgLengthValue(owner.getAttribute('width'), base.x) ??
                        base.x,
                    y:
                        svgLengthValue(owner.getAttribute('height'), base.y) ??
                        base.y,
                };
        viewports.set(owner, result);
        return result;
    };
    const read = (element, name, axis, fallback = 0) => {
        const text = element.getAttribute(name);
        let base = 0;
        if (text?.includes('%')) {
            const size = viewport(element);
            base =
                axis === 'diagonal'
                    ? Math.hypot(size.x, size.y) / Math.SQRT2
                    : size[axis];
        }
        return svgLengthValue(text, base) ?? fallback;
    };
    read.viewport = viewport;
    return read;
}

export function svgViewBox(element) {
    const box = (element.getAttribute('viewBox') ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
    return box.length === 4 &&
        box.every(Number.isFinite) &&
        box[2] >= 0 &&
        box[3] >= 0
        ? box
        : null;
}

// Root geometry stays in source units; only nested viewports map into that space.
export function nestedSvgViewport(element, parent) {
    const width =
        svgLengthValue(element.getAttribute('width'), parent.x) ?? parent.x;
    const height =
        svgLengthValue(element.getAttribute('height'), parent.y) ?? parent.y;
    const x = svgLengthValue(element.getAttribute('x'), parent.x) ?? 0;
    const y = svgLengthValue(element.getAttribute('y'), parent.y) ?? 0;
    const box = svgViewBox(element);
    if (width <= 0 || height <= 0 || box?.[2] === 0 || box?.[3] === 0)
        return {
            rendered: false,
            size: { x: 0, y: 0 },
            matrix: createMatrix(),
        };
    const matrix = svgViewportMatrix(element, box, width, height, x, y);
    const size = box ? { x: box[2], y: box[3] } : { x: width, y: height };
    return { rendered: true, size, matrix, rectangle: { x, y, width, height } };
}

export function svgViewportMatrix(element, box, width, height, x = 0, y = 0) {
    let sx = 1,
        sy = 1,
        tx = x,
        ty = y;
    if (box) {
        let aspect = (element.getAttribute('preserveAspectRatio') ?? '').trim();
        if (
            !/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?$/.test(
                aspect,
            )
        )
            aspect = 'xMidYMid meet';
        sx = width / box[2];
        sy = height / box[3];
        if (!aspect.startsWith('none'))
            sx = sy = aspect.endsWith('slice')
                ? Math.max(sx, sy)
                : Math.min(sx, sy);
        tx -= box[0] * sx;
        ty -= box[1] * sy;
        if (aspect.includes('xMid')) tx += (width - box[2] * sx) / 2;
        if (aspect.includes('xMax')) tx += width - box[2] * sx;
        if (aspect.includes('YMid')) ty += (height - box[3] * sy) / 2;
        if (aspect.includes('YMax')) ty += height - box[3] * sy;
    }
    if (![sx, sy, tx, ty, width, height].every(Number.isFinite))
        throw new Error('Invalid SVG viewport coordinates.');
    return createMatrix(sx, 0, 0, sy, tx, ty);
}
