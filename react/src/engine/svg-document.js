import { createMatrix } from '../geometry/matrix.js';
import {
    svgLengthValue,
    svgViewBox,
    svgViewportMatrix,
} from './svg-lengths.js';
const MM_PER_PIXEL = 25.4 / 96;

function rootLength(text) {
    if (text?.includes('%')) return null;
    const pixels = svgLengthValue(text);
    if (pixels === null || pixels < 0) return null;
    const unit =
        text
            .trim()
            .match(/[a-z]+$/i)?.[0]
            ?.toLowerCase() ?? 'px';
    const amount = Number(text.trim().replace(/[a-z]+$/i, ''));
    const mm =
        amount *
        {
            px: MM_PER_PIXEL,
            in: 25.4,
            cm: 10,
            mm: 1,
            q: 0.25,
            pt: 25.4 / 72,
            pc: 25.4 / 6,
        }[unit];
    if (!Number.isFinite(mm)) throw new Error('Invalid SVG physical size.');
    return { pixels, mm };
}

function rootOrigin(root, width, height, factor) {
    const fallback = { x: width / 2, y: height / 2 };
    let parts = (root.getAttribute('transform-origin') ?? '50% 50%')
        .trim()
        .split(/\s+/);
    if (parts.length === 3 && svgLengthValue(parts[2]) !== null)
        parts = parts.slice(0, 2);
    if (parts.length === 1)
        parts = ['top', 'bottom'].includes(parts[0])
            ? ['center', parts[0]]
            : [parts[0], 'center'];
    if (parts.length !== 2) return fallback;
    const keywords = ['left', 'right', 'top', 'bottom', 'center'];
    if (
        parts.every((p) => keywords.includes(p)) &&
        (['top', 'bottom'].includes(parts[0]) ||
            ['left', 'right'].includes(parts[1]))
    )
        parts.reverse();
    const position = (text, axis, base) => {
        if (text === 'center') return base / 2;
        if (text === (axis === 'x' ? 'left' : 'top')) return 0;
        if (text === (axis === 'x' ? 'right' : 'bottom')) return base;
        if (keywords.includes(text)) return null;
        const value = svgLengthValue(text, base);
        return value === null
            ? null
            : text.includes('%')
              ? value
              : value * factor;
    };
    const x = position(parts[0], 'x', width),
        y = position(parts[1], 'y', height);
    return x !== null && y !== null ? { x, y } : fallback;
}

// The import remains in chosen source units until scaleImportResult converts to mm.
export function svgDocumentSpace(root) {
    const box = svgViewBox(root),
        validBox = box && box[2] > 0 && box[3] > 0;
    const width = rootLength(root.getAttribute('width'));
    const height = rootLength(root.getAttribute('height'));
    const useWidth = validBox && width?.mm > 0,
        useHeight = validBox && height?.mm > 0;
    const scale = useWidth
        ? width.mm / box[2]
        : useHeight
          ? height.mm / box[3]
          : MM_PER_PIXEL;
    if (!Number.isFinite(scale) || scale <= 0)
        throw new Error('Invalid SVG physical size.');
    const factor = useWidth || useHeight ? MM_PER_PIXEL / scale : 1;
    // An offline, dimensionless SVG uses its natural viewBox extent, not a browser window.
    const viewportWidth = useWidth
        ? box[2]
        : width !== null
          ? width.mm / scale
          : validBox
            ? useHeight
                ? ((height.mm / scale) * box[2]) / box[3]
                : box[2]
            : 300;
    const viewportHeight =
        useHeight && !useWidth
            ? box[3]
            : height !== null
              ? height.mm / scale
              : validBox
                ? useWidth
                    ? ((width.mm / scale) * box[3]) / box[2]
                    : box[3]
                : 150;
    if (
        ![factor, viewportWidth, viewportHeight].every(Number.isFinite) ||
        factor <= 0
    )
        throw new Error('Invalid SVG viewport coordinates.');
    const rendered =
        viewportWidth > 0 &&
        viewportHeight > 0 &&
        (!box || (box[2] > 0 && box[3] > 0));
    return {
        scale,
        source: useWidth || useHeight ? 'svg-physical-size' : 'svg-pixels',
        factor,
        rendered,
        size: { x: viewportWidth, y: viewportHeight },
        origin: rootOrigin(root, viewportWidth, viewportHeight, factor),
        flip: createMatrix(1, 0, 0, -1, 0, viewportHeight),
        viewport: rendered
            ? svgViewportMatrix(root, box, viewportWidth, viewportHeight)
            : createMatrix(),
    };
}
