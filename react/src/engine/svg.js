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
                for (const subpath of splitSvgPathSubpaths(pathData)) {
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
