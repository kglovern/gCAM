/**
 * Purpose: Implementation module for matrix in the geometry domain.
 */
import { closePoints } from './primitives.js';

export function createMatrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    return { a, b, c, d, e, f };
}

export function multiplyMatrices(left, right) {
    return {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        e: left.a * right.e + left.c * right.f + left.e,
        f: left.b * right.e + left.d * right.f + left.f,
    };
}

export function applyMatrixToPoint(point, matrix) {
    return {
        x: point.x * matrix.a + point.y * matrix.c + matrix.e,
        y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
}

export function parseSvgTransform(transformText) {
    if (!transformText?.trim()) return createMatrix();
    const commandPattern = /([a-zA-Z]+)\(([^)]*)\)/g;
    let matrix = createMatrix();
    let match = commandPattern.exec(transformText);
    while (match) {
        const command = match[1].toLowerCase();
        const values = (
            match[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
        )
            .map((value) => Number.parseFloat(value))
            .filter(Number.isFinite);
        let next = createMatrix();
        if (command === 'matrix' && values.length >= 6)
            next = createMatrix(...values.slice(0, 6));
        else if (command === 'translate')
            next = createMatrix(1, 0, 0, 1, values[0] || 0, values[1] || 0);
        else if (command === 'scale')
            next = createMatrix(
                values[0] ?? 1,
                0,
                0,
                values[1] ?? values[0] ?? 1,
                0,
                0,
            );
        else if (command === 'rotate') {
            const angle = ((values[0] || 0) * Math.PI) / 180;
            const rotation = createMatrix(
                Math.cos(angle),
                Math.sin(angle),
                -Math.sin(angle),
                Math.cos(angle),
                0,
                0,
            );
            next =
                values.length >= 3
                    ? multiplyMatrices(
                          multiplyMatrices(
                              createMatrix(1, 0, 0, 1, values[1], values[2]),
                              rotation,
                          ),
                          createMatrix(1, 0, 0, 1, -values[1], -values[2]),
                      )
                    : rotation;
        } else if (command === 'skewx')
            next = createMatrix(
                1,
                0,
                Math.tan(((values[0] || 0) * Math.PI) / 180),
                1,
                0,
                0,
            );
        else if (command === 'skewy')
            next = createMatrix(
                1,
                Math.tan(((values[0] || 0) * Math.PI) / 180),
                0,
                1,
                0,
                0,
            );
        matrix = multiplyMatrices(matrix, next);
        match = commandPattern.exec(transformText);
    }
    return matrix;
}

export function parseSvgCoordinateList(text) {
    return (text || '')
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number.parseFloat(value))
        .filter(Number.isFinite);
}

export function parseSvgPoints(text, matrix) {
    const values = parseSvgCoordinateList(text);
    const points = [];
    for (let i = 0; i < values.length - 1; i += 2)
        points.push(
            applyMatrixToPoint({ x: values[i], y: values[i + 1] }, matrix),
        );
    return points;
}

export function sampleEllipsePoints(cx, cy, rx, ry, matrix, steps = 72) {
    const points = [];
    for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        points.push(
            applyMatrixToPoint(
                { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry },
                matrix,
            ),
        );
    }
    return closePoints(points);
}
