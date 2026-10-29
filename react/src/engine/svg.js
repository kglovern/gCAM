/**
 * Purpose: Implementation module for svg in the react domain.
 */
import { svgLayerMetadata } from '../layers/importMetadata.js';
import { TOOLPATH_SAMPLE_STEP } from './constants.js';
import {
    createMatrix,
    multiplyMatrices,
    applyMatrixToPoint,
    parseSvgTransform,
    parseSvgPoints,
    sampleEllipsePoints,
} from '../geometry/matrix.js';
import { closePoints } from '../geometry/primitives.js';

export function parseSvg(text) {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror')) {
        throw new Error('Invalid SVG');
    }

    const entities = [];

    function visit(element, inheritedMatrix) {
        if (!(element instanceof Element)) {
            return;
        }
        const tag = element.tagName.toLowerCase();
        const matrix = multiplyMatrices(
            inheritedMatrix,
            parseSvgTransform(element.getAttribute('transform')),
        );

        if (tag === 'g' || tag === 'svg') {
            for (const child of element.children) {
                visit(child, matrix);
            }
            return;
        }

        if (tag === 'line') {
            const start = applyMatrixToPoint(
                {
                    x:
                        Number.parseFloat(element.getAttribute('x1') || '0') ||
                        0,
                    y:
                        Number.parseFloat(element.getAttribute('y1') || '0') ||
                        0,
                },
                matrix,
            );
            const end = applyMatrixToPoint(
                {
                    x:
                        Number.parseFloat(element.getAttribute('x2') || '0') ||
                        0,
                    y:
                        Number.parseFloat(element.getAttribute('y2') || '0') ||
                        0,
                },
                matrix,
            );
            entities.push({
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
                entities.push(
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
            const x = Number.parseFloat(element.getAttribute('x') || '0') || 0;
            const y = Number.parseFloat(element.getAttribute('y') || '0') || 0;
            const width =
                Number.parseFloat(element.getAttribute('width') || '0') || 0;
            const height =
                Number.parseFloat(element.getAttribute('height') || '0') || 0;
            if (width > 0 && height > 0) {
                const points = [
                    applyMatrixToPoint({ x, y }, matrix),
                    applyMatrixToPoint({ x: x + width, y }, matrix),
                    applyMatrixToPoint({ x: x + width, y: y + height }, matrix),
                    applyMatrixToPoint({ x, y: y + height }, matrix),
                ];
                entities.push(polylineEntityFromPoints(points, true, element));
            }
            return;
        }

        if (tag === 'circle') {
            const cx =
                Number.parseFloat(element.getAttribute('cx') || '0') || 0;
            const cy =
                Number.parseFloat(element.getAttribute('cy') || '0') || 0;
            const r = Number.parseFloat(element.getAttribute('r') || '0') || 0;
            if (r > 0) {
                entities.push(
                    polylineEntityFromPoints(
                        sampleEllipsePoints(cx, cy, r, r, matrix),
                        true,
                        element,
                    ),
                );
            }
            return;
        }

        if (tag === 'ellipse') {
            const cx =
                Number.parseFloat(element.getAttribute('cx') || '0') || 0;
            const cy =
                Number.parseFloat(element.getAttribute('cy') || '0') || 0;
            const rx =
                Number.parseFloat(element.getAttribute('rx') || '0') || 0;
            const ry =
                Number.parseFloat(element.getAttribute('ry') || '0') || 0;
            if (rx > 0 && ry > 0) {
                entities.push(
                    polylineEntityFromPoints(
                        sampleEllipsePoints(cx, cy, rx, ry, matrix),
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
                    const points = sampleSvgPathPoints(subpath, matrix, closed);
                    if (points.length >= 2) {
                        entities.push(
                            polylineEntityFromPoints(points, closed, element),
                        );
                    }
                }
            }
        }
    }

    visit(documentNode.documentElement, createMatrix());
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
    return {
        type: sourceType,
        ...svgLayerMetadata(element),
        handle: '',
        color: 256,
        vertices: points.map((point) => ({ x: point.x, y: point.y, bulge: 0 })),
        closed,
    };
}

function sampleSvgPathPoints(pathData, matrix, closed) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';
    svg.style.opacity = '0';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);

    try {
        const totalLength = path.getTotalLength();
        const steps = Math.max(
            24,
            Math.ceil(totalLength / TOOLPATH_SAMPLE_STEP),
        );
        const points = [];
        for (let i = 0; i <= steps; i += 1) {
            const point = path.getPointAtLength((totalLength * i) / steps);
            points.push(applyMatrixToPoint({ x: point.x, y: point.y }, matrix));
        }
        return closed ? closePoints(points) : points;
    } finally {
        svg.remove();
    }
}
