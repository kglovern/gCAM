import {
    svgImageDescriptor,
    svgProperty,
    svgRectangle,
    svgPresentation,
} from './svg-image.js';
import { svgDocumentSpace } from './svg-document.js';
import { svgUseResolver } from './svg-use.js';
import { svgLengthReader, nestedSvgViewport } from './svg-lengths.js';
/**
 * Purpose: Implementation module for svg in the react domain.
 */
import { svgLayerMetadata } from '../layers/importMetadata.js';
import {
    flattenBezier,
    flattenEllipse,
    flattenSvgArc,
    SVG_CURVE_TOLERANCE,
} from '../geometry/curveFlattening.js';
import {
    createMatrix,
    multiplyMatrices,
    applyMatrixToPoint,
    parseSvgTransform,
    parseSvgPoints,
} from '../geometry/matrix.js';
import { closePoints } from '../geometry/primitives.js';

export function parseSvg(
    text,
    { curveTolerance = SVG_CURVE_TOLERANCE, coordinateSpace = 'svg' } = {},
) {
    if (coordinateSpace !== 'svg' && coordinateSpace !== 'cam')
        throw new Error('Invalid SVG coordinate space.');
    if (!Number.isFinite(curveTolerance) || curveTolerance <= 0)
        throw new Error('Invalid SVG curve tolerance.');
    const ellipse = (cx, cy, rx, ry, matrix) =>
        flattenEllipse(
            applyMatrixToPoint({ x: cx, y: cy }, matrix),
            { x: matrix.a * rx, y: matrix.b * rx },
            { x: matrix.c * ry, y: matrix.d * ry },
            0,
            2 * Math.PI,
            curveTolerance,
        );
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror')) {
        throw new Error('Invalid SVG');
    }

    const documentSpace =
        coordinateSpace === 'cam'
            ? svgDocumentSpace(documentNode.documentElement)
            : null;
    if (documentSpace && !documentSpace.rendered) return [];
    const entities = [];
    const length = svgLengthReader();
    const resolveUse = svgUseResolver(documentNode, length);
    let vertexCount = 0,
        imageCount = 0,
        imageChars = 0;
    const append = (entity) => {
        vertexCount += entity.vertices?.length ?? 2;
        if (vertexCount > 2000000)
            throw new Error(
                'SVG geometry is too detailed; simplify the artwork.',
            );
        entities.push(entity);
    };

    function visit(element, inheritedMatrix, depth = 0, imageClips = []) {
        if (depth > 256) throw new Error('SVG geometry is too deeply nested.');
        if (!(element instanceof Element)) {
            return;
        }
        const tag = element.localName.toLowerCase();
        if (
            ![
                'g',
                'svg',
                'use',
                'image',
                'line',
                'polyline',
                'polygon',
                'rect',
                'circle',
                'ellipse',
                'path',
            ].includes(tag)
        )
            return;
        const presentation = svgPresentation(element);
        if (!presentation.displayed) return;
        // Visibility can be overridden by descendants; display:none and zero opacity cannot.
        if (!presentation.visible && !['g', 'svg', 'use'].includes(tag)) return;
        const transform = parseSvgTransform(element.getAttribute('transform'));
        if (documentSpace && element === documentNode.documentElement) {
            transform.e *= documentSpace.factor;
            transform.f *= documentSpace.factor;
            const { x, y } = documentSpace.origin;
            transform.e += x - transform.a * x - transform.c * y;
            transform.f += y - transform.b * x - transform.d * y;
        }
        let matrix = multiplyMatrices(inheritedMatrix, transform);
        if (documentSpace && element === documentNode.documentElement) {
            if (svgProperty(element, 'overflow') !== 'visible')
                imageClips = [
                    ...imageClips,
                    svgRectangle(
                        matrix,
                        0,
                        0,
                        documentSpace.size.x,
                        documentSpace.size.y,
                    ),
                ];
            matrix = multiplyMatrices(matrix, documentSpace.viewport);
        }

        if (tag === 'use') {
            const translated = multiplyMatrices(
                matrix,
                createMatrix(
                    1,
                    0,
                    0,
                    1,
                    length(element, 'x', 'x'),
                    length(element, 'y', 'y'),
                ),
            );
            resolveUse(element, (clone) =>
                visit(clone, translated, depth + 1, imageClips),
            );
            return;
        }
        if (tag === 'svg' && element !== documentNode.documentElement) {
            const parent = element.parentElement?.closest('svg');
            const viewport = nestedSvgViewport(
                element,
                length.viewport(parent),
            );
            if (!viewport.rendered) return;
            if (svgProperty(element, 'overflow') !== 'visible') {
                const { x, y, width, height } = viewport.rectangle;
                imageClips = [
                    ...imageClips,
                    svgRectangle(matrix, x, y, width, height),
                ];
            }
            matrix = multiplyMatrices(matrix, viewport.matrix);
        }
        if (tag === 'g' || tag === 'svg') {
            for (const child of element.children) {
                visit(child, matrix, depth + 1, imageClips);
            }
            return;
        }

        if (tag === 'image') {
            const image = svgImageDescriptor(
                element,
                matrix,
                length,
                imageClips,
            );
            if (image) {
                imageCount++;
                imageChars += image.dataUrl.length;
                if (imageCount > 1024 || imageChars > 64 * 1024 * 1024)
                    throw new Error(
                        'SVG contains too much embedded image data.',
                    );
                append({ ...image, ...svgLayerMetadata(element) });
            }
            return;
        }

        if (tag === 'line') {
            const start = applyMatrixToPoint(
                {
                    x: length(element, 'x1', 'x'),
                    y: length(element, 'y1', 'y'),
                },
                matrix,
            );
            const end = applyMatrixToPoint(
                {
                    x: length(element, 'x2', 'x'),
                    y: length(element, 'y2', 'y'),
                },
                matrix,
            );
            if (
                [start, end].some(
                    (point) =>
                        !Number.isFinite(point.x) || !Number.isFinite(point.y),
                )
            )
                throw new Error('Invalid SVG geometry coordinates.');
            append({
                type: 'LINE',
                ...svgLayerMetadata(element),
                handle: '',
                color: 256,
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
            });
            return;
        }

        if (tag === 'polyline' || tag === 'polygon') {
            const points = parseSvgPoints(
                element.getAttribute('points'),
                matrix,
            );
            if (points.length >= 2) {
                append(
                    polylineEntityFromPoints(
                        points,
                        tag === 'polygon',
                        element,
                    ),
                );
            }
            return;
        }

        if (tag === 'rect') {
            const x = length(element, 'x', 'x');
            const y = length(element, 'y', 'y');
            const width = length(element, 'width', 'x');
            const height = length(element, 'height', 'y');
            if (width > 0 && height > 0) {
                const radiusX = length(element, 'rx', 'x', null),
                    radiusY = length(element, 'ry', 'y', null);
                const validX =
                    radiusX !== null && radiusX >= 0 ? radiusX : null;
                const validY =
                    radiusY !== null && radiusY >= 0 ? radiusY : null;
                const rx = Math.min(validX ?? validY ?? 0, width / 2),
                    ry = Math.min(validY ?? validX ?? 0, height / 2);
                const points =
                    rx > 0 && ry > 0
                        ? sampleSvgPathPoints(
                              `M${x + rx} ${y} H${x + width - rx} A${rx} ${ry} 0 0 1 ${x + width} ${y + ry} V${y + height - ry} A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + height - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`,
                              matrix,
                              true,
                              curveTolerance,
                          )
                        : [
                              applyMatrixToPoint({ x, y }, matrix),
                              applyMatrixToPoint({ x: x + width, y }, matrix),
                              applyMatrixToPoint(
                                  { x: x + width, y: y + height },
                                  matrix,
                              ),
                              applyMatrixToPoint({ x, y: y + height }, matrix),
                          ];
                append(polylineEntityFromPoints(points, true, element));
            }
            return;
        }

        if (tag === 'circle') {
            const cx = length(element, 'cx', 'x');
            const cy = length(element, 'cy', 'y');
            const r = length(element, 'r', 'diagonal');
            if (r > 0) {
                append(
                    polylineEntityFromPoints(
                        ellipse(cx, cy, r, r, matrix),
                        true,
                        element,
                    ),
                );
            }
            return;
        }

        if (tag === 'ellipse') {
            const cx = length(element, 'cx', 'x');
            const cy = length(element, 'cy', 'y');
            const rx = length(element, 'rx', 'x');
            const ry = length(element, 'ry', 'y');
            if (rx > 0 && ry > 0) {
                append(
                    polylineEntityFromPoints(
                        ellipse(cx, cy, rx, ry, matrix),
                        true,
                        element,
                    ),
                );
            }
            return;
        }

        if (tag === 'path') {
            const pathData = element.getAttribute('d') || '';
            if (pathData.trim()) {
                for (const subpath of absolutizeSubpathStarts(
                    splitSvgPathSubpaths(pathData),
                )) {
                    const closed = /[zZ]/.test(subpath);
                    const points = sampleSvgPathPoints(
                        subpath,
                        matrix,
                        closed,
                        curveTolerance,
                    );
                    if (points.length >= 2) {
                        append(
                            polylineEntityFromPoints(points, closed, element),
                        );
                    }
                }
            }
        }
    }

    visit(documentNode.documentElement, documentSpace?.flip ?? createMatrix());
    return entities;
}

function splitSvgPathSubpaths(pathData) {
    const starts = [];
    const moveCommand = /[Mm](?=\s*[-+]?(?:\d|\.\d))/g;
    let match = moveCommand.exec(pathData);
    while (match) {
        starts.push(match.index);
        match = moveCommand.exec(pathData);
    }
    if (starts.length < 2) {
        return [pathData];
    }
    return starts
        .map((start, index) => pathData.slice(start, starts[index + 1]).trim())
        .filter(Boolean);
}

const PATH_ARG_COUNTS = {
    m: 2,
    l: 2,
    t: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    a: 7,
    z: 0,
};
const PATH_NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

function parsePathCommands(pathData) {
    const commands = [];
    let current = null;
    let index = 0;
    while (index < pathData.length) {
        const char = pathData[index];
        if (/[\s,]/.test(char)) {
            index += 1;
            continue;
        }
        if (/[a-zA-Z]/.test(char)) {
            if (!(char.toLowerCase() in PATH_ARG_COUNTS)) break;
            current = { command: char, args: [] };
            commands.push(current);
            index += 1;
            continue;
        }
        if (!current) break;
        // Arc flags may be packed without separators ("a5 5 0 011 10 10").
        const argIndex = current.args.length % 7;
        if (
            current.command.toLowerCase() === 'a' &&
            (argIndex === 3 || argIndex === 4)
        ) {
            if (char !== '0' && char !== '1') break;
            current.args.push(Number(char));
            index += 1;
            continue;
        }
        PATH_NUMBER.lastIndex = index;
        const match = PATH_NUMBER.exec(pathData);
        if (!match) break;
        current.args.push(Number.parseFloat(match[0]));
        index = PATH_NUMBER.lastIndex;
    }
    return commands;
}

function advancePathPoint(commands, point) {
    for (const { command, args } of commands) {
        const key = command.toLowerCase();
        const relative = command !== command.toUpperCase();
        if (key === 'z') {
            point.x = point.startX;
            point.y = point.startY;
            continue;
        }
        const count = PATH_ARG_COUNTS[key];
        for (let i = 0; i + count <= args.length; i += count) {
            if (key === 'h') {
                point.x = relative ? point.x + args[i] : args[i];
            } else if (key === 'v') {
                point.y = relative ? point.y + args[i] : args[i];
            } else {
                const x = args[i + count - 2];
                const y = args[i + count - 1];
                point.x = relative ? point.x + x : x;
                point.y = relative ? point.y + y : y;
            }
            if (key === 'm' && i === 0) {
                point.startX = point.x;
                point.startY = point.y;
            }
        }
    }
}

/**
 * A relative `m` is measured from the previous subpath's current point, but
 * once a subpath is sampled on its own it would be measured from the origin.
 * Rewrite each subpath's leading `m` as an absolute `M` so positions survive.
 */
export function absolutizeSubpathStarts(subpaths) {
    const point = { x: 0, y: 0, startX: 0, startY: 0 };
    return subpaths.map((subpath, index) => {
        const commands = parsePathCommands(subpath);
        let result = subpath;
        const [first, ...others] = commands;
        if (index > 0 && first?.command === 'm' && first.args.length >= 2) {
            const [dx, dy, ...lineArgs] = first.args;
            const parts = [`M${point.x + dx} ${point.y + dy}`];
            if (lineArgs.length) parts.push(`l${lineArgs.join(' ')}`);
            for (const { command, args } of others) {
                parts.push(`${command}${args.join(' ')}`);
            }
            result = parts.join(' ');
        }
        advancePathPoint(commands, point);
        return result;
    });
}

function polylineEntityFromPoints(
    points,
    closed,
    element,
    sourceType = 'POLYLINE',
) {
    if (
        points.some(
            (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
        )
    )
        throw new Error('Invalid SVG geometry coordinates.');
    return {
        type: sourceType,
        ...svgLayerMetadata(element),
        handle: '',
        color: 256,
        vertices: points.map((point) => ({ x: point.x, y: point.y, bulge: 0 })),
        closed,
    };
}

export function* svgPathSegments(pathData) {
    const commands = parsePathCommands(pathData);
    if (commands[0]?.command.toLowerCase() !== 'm')
        throw new Error('SVG path must start with a move.');
    const point = { x: 0, y: 0, startX: 0, startY: 0 };
    let cubic = null,
        quadratic = null;
    for (const { command, args } of commands) {
        const key = command.toLowerCase(),
            count = PATH_ARG_COUNTS[key];
        if (
            !args.every(Number.isFinite) ||
            (count
                ? !args.length || args.length % count !== 0
                : args.length !== 0)
        )
            throw new Error('Invalid SVG path coordinates.');
        if (key === 'z') {
            const start = { x: point.x, y: point.y };
            advancePathPoint([{ command, args }], point);
            yield {
                start,
                end: { x: point.x, y: point.y },
                move: false,
                curve: null,
            };
            cubic = quadratic = null;
            continue;
        }
        for (let i = 0; i < args.length; i += count) {
            const values = args.slice(i, i + count);
            const next =
                key === 'm' && i > 0 ? (command === 'm' ? 'l' : 'L') : command;
            const type = next.toLowerCase(),
                relative = next !== next.toUpperCase();
            const start = { x: point.x, y: point.y };
            const absolute = (index) => ({
                x: values[index] + (relative ? start.x : 0),
                y: values[index + 1] + (relative ? start.y : 0),
            });
            advancePathPoint([{ command: next, args: values }], point);
            const end = { x: point.x, y: point.y };
            let curve = null,
                controls = null,
                arc = null,
                nextCubic = null,
                nextQuadratic = null;
            if (type === 'c' || type === 's') {
                const first =
                    type === 'c'
                        ? absolute(0)
                        : cubic
                          ? {
                                x: 2 * start.x - cubic.x,
                                y: 2 * start.y - cubic.y,
                            }
                          : start;
                const second = absolute(type === 'c' ? 2 : 0);
                curve = `C${first.x} ${first.y} ${second.x} ${second.y} ${end.x} ${end.y}`;
                controls = [start, first, second, end];
                nextCubic = second;
            } else if (type === 'q' || type === 't') {
                const control =
                    type === 'q'
                        ? absolute(0)
                        : quadratic
                          ? {
                                x: 2 * start.x - quadratic.x,
                                y: 2 * start.y - quadratic.y,
                            }
                          : start;
                curve = `Q${control.x} ${control.y} ${end.x} ${end.y}`;
                controls = [start, control, end];
                nextQuadratic = control;
            } else if (type === 'a') {
                arc = values.slice(0, 5);
                curve = `A${arc.join(' ')} ${end.x} ${end.y}`;
            }
            cubic = nextCubic;
            quadratic = nextQuadratic;
            yield {
                start,
                end,
                move: type === 'm',
                controls,
                arc,
                curve: curve ? `M${start.x} ${start.y} ${curve}` : null,
            };
        }
    }
}

function sampleSvgPathPoints(pathData, matrix, closed, tolerance) {
    const points = [];
    const append = (point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
            throw new Error('Invalid SVG path coordinates.');
        if (points.at(-1)?.x === point.x && points.at(-1)?.y === point.y)
            return;
        if (points.length >= 1000000)
            throw new Error('SVG path is too detailed; simplify the artwork.');
        points.push(point);
    };
    for (const segment of svgPathSegments(pathData)) {
        const budget = Math.min(1000000, 1000000 - points.length + 1);
        const sampled = segment.controls
            ? flattenBezier(
                  segment.controls.map((point) =>
                      applyMatrixToPoint(point, matrix),
                  ),
                  tolerance,
                  budget,
              )
            : segment.arc
              ? flattenSvgArc(
                    segment.start,
                    segment.end,
                    segment.arc,
                    matrix,
                    tolerance,
                    budget,
                )
              : null;
        if (sampled)
            for (let i = 1; i < sampled.length; i++) append(sampled[i]);
        else append(applyMatrixToPoint(segment.end, matrix));
    }
    return closed ? closePoints(points) : points;
}
