import { applyMatrixToPoint, multiplyMatrices } from '../geometry/matrix.js';
import { svgViewportMatrix } from './svg-lengths.js';
export const SVG_IMAGE_PIXELS = 16000000;

export function svgProperty(element, name) {
    const valid = (value) => {
        if (value === null) return true;
        if (name === 'opacity')
            return (
                /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?|inherit|initial|unset|revert)$/i.test(
                    value,
                ) || /(?:var|calc)\(/i.test(value)
            );
        if (name === 'visibility')
            return /^(?:visible|hidden|collapse|inherit|initial|unset|revert)$/i.test(
                value,
            );
        return true;
    };
    let value = element.getAttribute(name)?.trim() ?? null,
        important = false;
    if (!valid(value)) value = null;
    const style = (element.getAttribute('style') ?? '').replace(
        /\/\*[\s\S]*?\*\//g,
        '',
    );
    for (const declaration of style.split(';')) {
        const colon = declaration.indexOf(':');
        if (declaration.slice(0, colon).trim().toLowerCase() !== name) continue;
        const raw = declaration.slice(colon + 1).trim();
        const priority = /!\s*important$/i.test(raw);
        const candidate = raw.replace(/!\s*important$/i, '').trim();
        if (!valid(candidate)) continue;
        if (candidate && (!important || priority)) {
            value = candidate;
            important = priority;
        }
    }
    if (
        value &&
        /^(?:inherit|initial|unset|revert|none|hidden|collapse|visible)$/i.test(
            value,
        )
    )
        value = value.toLowerCase();
    if (value === 'inherit' || (name === 'visibility' && value === 'unset'))
        return element.parentElement
            ? svgProperty(element.parentElement, name)
            : null;
    if (name === 'visibility' && value === 'initial') return 'visible';
    return value;
}
export function svgRectangle(matrix, x, y, w, h) {
    return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
    ].map(([x, y]) => applyMatrixToPoint({ x, y }, matrix));
}
export function svgPresentation(element) {
    let opacity = 1,
        visibility;
    for (let node = element; node; node = node.parentElement) {
        if (svgProperty(node, 'display')?.trim() === 'none')
            return { displayed: false, visible: false, opacity: 0 };
        visibility ??= svgProperty(node, 'visibility');
        const text = svgProperty(node, 'opacity');
        if (text !== null) {
            if (/(?:var|calc)\(/i.test(text))
                throw new Error(
                    'SVG opacity expressions are not supported yet; flatten the artwork before importing.',
                );
            const v = Number.parseFloat(text);
            if (Number.isFinite(v))
                opacity *= Math.max(
                    0,
                    Math.min(1, text.trim().endsWith('%') ? v / 100 : v),
                );
        }
    }
    return {
        displayed: opacity !== 0,
        visible:
            opacity !== 0 &&
            visibility !== 'hidden' &&
            visibility !== 'collapse',
        opacity,
    };
}
export function svgImageDescriptor(element, matrix, length, clips) {
    const width = length(element, 'width', 'x', null),
        height = length(element, 'height', 'y', null);
    if (width === 0 || height === 0) return null;
    const { visible, opacity } = svgPresentation(element);
    if (!visible) return null;
    for (let node = element; node; node = node.parentElement) {
        for (const property of ['clip-path', 'mask', 'filter']) {
            const value = svgProperty(node, property)?.trim();
            if (value && value !== 'none')
                throw new Error(
                    `SVG image ${property} is not supported yet; flatten that image before importing.`,
                );
        }
    }
    const dataUrl = (
        element.hasAttribute('href')
            ? element.getAttribute('href')
            : element.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    )?.trim();
    if (!dataUrl) return null;
    if (!/^data:image\/(?:png|jpeg)(?:;[^,]*)?,/i.test(dataUrl))
        throw new Error(
            'SVG images must contain embedded PNG or JPEG data; embed linked images before importing.',
        );
    return {
        type: 'SVG_IMAGE',
        dataUrl,
        matrix,
        x: length(element, 'x', 'x'),
        y: length(element, 'y', 'y'),
        width: width !== null && width > 0 ? width : null,
        height: height !== null && height > 0 ? height : null,
        aspect: element.getAttribute('preserveAspectRatio'),
        clips,
        opacity,
        clipViewport: svgProperty(element, 'overflow') !== 'visible',
    };
}
export function svgImagePlan(source, pixelW, pixelH, scaleToMm = 1) {
    if (!Number.isFinite(scaleToMm) || scaleToMm <= 0)
        throw new Error('Invalid SVG image scale.');
    if (
        !Number.isSafeInteger(pixelW) ||
        !Number.isSafeInteger(pixelH) ||
        pixelW < 1 ||
        pixelH < 1 ||
        pixelW > 16384 ||
        pixelH > 16384 ||
        pixelW * pixelH > SVG_IMAGE_PIXELS
    )
        throw new Error(
            'SVG image exceeds pixel limits: 16 million pixels and 16,384 per side.',
        );
    const width =
        source.width ??
        (source.height !== null ? (source.height * pixelW) / pixelH : pixelW);
    const height =
        source.height ??
        (source.width !== null ? (source.width * pixelH) / pixelW : pixelH);
    const fit = svgViewportMatrix(
        { getAttribute: () => source.aspect },
        [0, 0, pixelW, pixelH],
        width,
        height,
        source.x,
        source.y,
    );
    const matrix = multiplyMatrices(source.matrix, fit);
    const corners = svgRectangle(matrix, 0, 0, pixelW, pixelH);
    const clips = source.clipViewport
        ? [
              ...source.clips,
              svgRectangle(source.matrix, source.x, source.y, width, height),
          ]
        : source.clips;
    const sx = Math.hypot(matrix.a, matrix.b),
        sy = Math.hypot(matrix.c, matrix.d),
        det = matrix.a * matrix.d - matrix.b * matrix.c;
    if (
        ![sx, sy, det, ...corners.flatMap((p) => [p.x, p.y])].every(
            Number.isFinite,
        ) ||
        sx === 0 ||
        sy === 0 ||
        det === 0
    )
        throw new Error('Invalid SVG image transform.');
    const inside = (point, polygon) => {
        let positive = false,
            negative = false;
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
                b = polygon[(i + 1) % polygon.length];
            const cross =
                (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
            positive ||= cross > 1e-9;
            negative ||= cross < -1e-9;
        }
        return !(positive && negative);
    };
    const direct =
        Math.abs(matrix.a * matrix.c + matrix.b * matrix.d) <=
            sx * sy * 1e-10 &&
        corners.every((p) => clips.every((clip) => inside(p, clip)));
    const centre = applyMatrixToPoint({ x: pixelW / 2, y: pixelH / 2 }, matrix);
    if (direct)
        return {
            direct: true,
            flipY: det > 0,
            x: centre.x - (sx * pixelW) / 2,
            y: centre.y - (sy * pixelH) / 2,
            w: sx * pixelW,
            h: sy * pixelH,
            rotation: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
            corners,
        };
    // A conservative inverse singular-value bound avoids silently losing source detail.
    const density = Math.max(
        Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d) / Math.abs(det),
        scaleToMm / 0.05,
    );
    let minX = Math.min(...corners.map((p) => p.x)),
        maxX = Math.max(...corners.map((p) => p.x));
    let minY = Math.min(...corners.map((p) => p.y)),
        maxY = Math.max(...corners.map((p) => p.y));
    for (const clip of clips) {
        minX = Math.max(minX, Math.min(...clip.map((p) => p.x)));
        maxX = Math.min(maxX, Math.max(...clip.map((p) => p.x)));
        minY = Math.max(minY, Math.min(...clip.map((p) => p.y)));
        maxY = Math.min(maxY, Math.max(...clip.map((p) => p.y)));
    }
    if (maxX <= minX || maxY <= minY) return null;
    const outW = Math.ceil((maxX - minX) * density),
        outH = Math.ceil((maxY - minY) * density);
    if (
        !Number.isSafeInteger(outW) ||
        !Number.isSafeInteger(outH) ||
        outW < 1 ||
        outH < 1 ||
        outW > 16384 ||
        outH > 16384 ||
        outW * outH > SVG_IMAGE_PIXELS
    )
        throw new Error(
            'Transformed SVG image exceeds pixel limits: 16 million pixels and 16,384 per side; simplify its transform.',
        );
    return {
        direct: false,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        rotation: 0,
        outW,
        outH,
        matrix,
        clips,
        corners: svgRectangle(
            { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            minX,
            minY,
            maxX - minX,
            maxY - minY,
        ),
    };
}
