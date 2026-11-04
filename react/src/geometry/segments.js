/**
 * Purpose: Implementation module for segments in the geometry domain.
 */
import { RENDER_SAMPLE_STEP } from '../engine/constants.js';
import {
    almostEqual,
    clonePoint,
    closePoints,
    dist,
    normalizeAngleDeg,
} from './primitives.js';
import {
    estimateBezierLength,
    estimateControlPolygonLength,
    evaluateBSplinePoint,
    evaluateBezier,
} from './splines.js';

function drawPolylineIntoPath(path, points, transform, startNewSubpath = true) {
    if (!points.length) return;
    const start = transform(points[0]);
    if (startNewSubpath) path.moveTo(start.x, start.y);
    else path.lineTo(start.x, start.y);
    for (let i = 1; i < points.length; i += 1) {
        const point = transform(points[i]);
        path.lineTo(point.x, point.y);
    }
}
function lineSegment(start, end, entity, sourceEntityIndex = -1) {
    return {
        kind: 'line',
        sourceEntityIndex,
        start: clonePoint(start),
        end: clonePoint(end),
        reverse() {
            return {
                ...this,
                start: clonePoint(this.end),
                end: clonePoint(this.start),
                reverse: this.reverse,
                draw: this.draw,
                flatten: this.flatten,
            };
        },
        draw(path, transform, _scale = 1, startNewSubpath = true) {
            const p = transform(this.start),
                q = transform(this.end);
            if (startNewSubpath) path.moveTo(p.x, p.y);
            path.lineTo(q.x, q.y);
        },
        flatten() {
            return [clonePoint(this.start), clonePoint(this.end)];
        },
    };
}
function arcSegment({
    start,
    end,
    cx,
    cy,
    radius,
    startAngle,
    endAngle,
    clockwise,
    entity,
    sourceEntityIndex,
}) {
    return {
        kind: 'arc',
        sourceEntityIndex,
        start: clonePoint(start),
        end: clonePoint(end),
        cx,
        cy,
        radius,
        startAngle,
        endAngle,
        clockwise,
        reverse() {
            return {
                ...this,
                start: clonePoint(this.end),
                end: clonePoint(this.start),
                startAngle: this.endAngle,
                endAngle: this.startAngle,
                clockwise: !this.clockwise,
                reverse: this.reverse,
                draw: this.draw,
                flatten: this.flatten,
            };
        },
        draw(path, transform, scale = 1, startNewSubpath = true) {
            const center = transform({ x: this.cx, y: this.cy });
            if (startNewSubpath) {
                const point = transform(this.start);
                path.moveTo(point.x, point.y);
            }
            path.arc(
                center.x,
                center.y,
                this.radius * scale,
                -this.startAngle,
                -this.endAngle,
                !this.clockwise,
            );
        },
        flatten(step = RENDER_SAMPLE_STEP) {
            const sweep = this.clockwise
                    ? this.startAngle - this.endAngle
                    : this.endAngle - this.startAngle,
                total = Math.abs(sweep),
                steps = Math.max(12, Math.ceil((this.radius * total) / step)),
                points = [];
            for (let i = 0; i <= steps; i += 1) {
                const angle = this.clockwise
                    ? this.startAngle - total * (i / steps)
                    : this.startAngle + total * (i / steps);
                points.push({
                    x: this.cx + Math.cos(angle) * this.radius,
                    y: this.cy + Math.sin(angle) * this.radius,
                });
            }
            return points;
        },
    };
}

export function entityToSegment(entity, sourceEntityIndex = -1) {
    if (entity.type === 'LINE')
        return lineSegment(
            { x: entity.x1, y: entity.y1 },
            { x: entity.x2, y: entity.y2 },
            entity,
            sourceEntityIndex,
        );
    if (entity.type === 'ARC') {
        const startAngle =
            (normalizeAngleDeg(entity.startAngleDeg) * Math.PI) / 180;
        let endAngle = (normalizeAngleDeg(entity.endAngleDeg) * Math.PI) / 180;
        if (endAngle <= startAngle) endAngle += Math.PI * 2;
        return arcSegment({
            start: {
                x: entity.cx + Math.cos(startAngle) * entity.radius,
                y: entity.cy + Math.sin(startAngle) * entity.radius,
            },
            end: {
                x: entity.cx + Math.cos(endAngle) * entity.radius,
                y: entity.cy + Math.sin(endAngle) * entity.radius,
            },
            cx: entity.cx,
            cy: entity.cy,
            radius: entity.radius,
            startAngle,
            endAngle,
            clockwise: false,
            entity,
            sourceEntityIndex,
        });
    }
    if (entity.type === 'CIRCLE')
        return {
            kind: 'circle',
            sourceEntityIndex,
            closed: true,
            cx: entity.cx,
            cy: entity.cy,
            radius: entity.radius,
            flatten(step = RENDER_SAMPLE_STEP) {
                const steps = Math.max(
                        36,
                        Math.ceil((Math.PI * 2 * this.radius) / step),
                    ),
                    points = [];
                for (let i = 0; i < steps; i += 1) {
                    const angle = (i / steps) * Math.PI * 2;
                    points.push({
                        x: this.cx + Math.cos(angle) * this.radius,
                        y: this.cy + Math.sin(angle) * this.radius,
                    });
                }
                return closePoints(points);
            },
        };
    if (entity.type === 'SPLINE') return createSplineSegment(entity);
    return null;
}

function createBulgeArcSegment(
    start,
    end,
    bulge,
    entity,
    sourceEntityIndex = -1,
) {
    const chord = dist(start, end);
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9 || chord <= 1e-9)
        return lineSegment(start, end, entity, sourceEntityIndex);
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        dx = end.x - start.x,
        dy = end.y - start.y,
        length = Math.hypot(dx, dy) || 1,
        offset = (chord * (1 - bulge * bulge)) / (4 * bulge),
        center = {
            x: midpoint.x + (-dy / length) * offset,
            y: midpoint.y + (dx / length) * offset,
        },
        startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const clockwise = bulge < 0;
    if (!clockwise && endAngle <= startAngle) endAngle += Math.PI * 2;
    else if (clockwise && endAngle >= startAngle) endAngle -= Math.PI * 2;
    return arcSegment({
        start,
        end,
        cx: center.x,
        cy: center.y,
        radius: dist(center, start),
        startAngle,
        endAngle,
        clockwise,
        entity,
        sourceEntityIndex,
    });
}

export function buildSegmentsFromPolylineEntity(entity, entityIndex) {
    const vertices = entity.vertices || [];
    if (vertices.length < 2) return [];
    const segments = [],
        count = entity.closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < count; i += 1) {
        const current = vertices[i],
            next = vertices[(i + 1) % vertices.length],
            start = { x: current.x, y: current.y },
            end = { x: next.x, y: next.y },
            bulge = Number(current.bulge) || 0;
        segments.push(
            Math.abs(bulge) > 1e-9
                ? createBulgeArcSegment(start, end, bulge, entity, entityIndex)
                : polylineSegmentFromPoints([start, end], entity, entityIndex),
        );
    }
    return segments;
}
function createSplineSegment(entity) {
    const cps = entity.controlPoints.map((point) => ({
            x: point.x,
            y: point.y,
            w: point.w,
        })),
        degree = entity.degree,
        knots = entity.knots.slice();
    const isBezier =
        degree === 3 &&
        cps.length === 4 &&
        knots.length === 8 &&
        almostEqual(knots[0], knots[1]) &&
        almostEqual(knots[1], knots[2]) &&
        almostEqual(knots[2], knots[3]) &&
        almostEqual(knots[4], knots[5]) &&
        almostEqual(knots[5], knots[6]) &&
        almostEqual(knots[6], knots[7]);
    if (isBezier)
        return {
            kind: 'bezier',
            sourceEntityIndex: entity.__sourceEntityIndex ?? -1,
            cps: cps.map(clonePoint),
            start: clonePoint(cps[0]),
            end: clonePoint(cps[3]),
            reverse() {
                const reversed = this.cps.slice().reverse();
                return {
                    ...this,
                    cps: reversed,
                    start: clonePoint(reversed[0]),
                    end: clonePoint(reversed[3]),
                    reverse: this.reverse,
                    draw: this.draw,
                    flatten: this.flatten,
                };
            },
            draw(path, transform, _scale = 1, startNewSubpath = true) {
                const p0 = transform(this.cps[0]),
                    p1 = transform(this.cps[1]),
                    p2 = transform(this.cps[2]),
                    p3 = transform(this.cps[3]);
                if (startNewSubpath) path.moveTo(p0.x, p0.y);
                path.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
            },
            flatten(step = RENDER_SAMPLE_STEP) {
                const steps = Math.max(
                        10,
                        Math.ceil(estimateBezierLength(this.cps) / step),
                    ),
                    points = [];
                for (let i = 0; i <= steps; i += 1)
                    points.push(evaluateBezier(this.cps, i / steps));
                return points;
            },
        };
    const start = evaluateBSplinePoint(degree, knots, cps, knots[degree]),
        end = evaluateBSplinePoint(
            degree,
            knots,
            cps,
            knots[knots.length - degree - 1],
        );
    return {
        kind: 'spline',
        sourceEntityIndex: entity.__sourceEntityIndex ?? -1,
        cps,
        degree,
        knots,
        start,
        end,
        reverse() {
            return polylineSegmentFromPoints(
                this.flatten().slice().reverse(),
                entity,
            );
        },
        draw(path, transform, _scale = 1, startNewSubpath = true) {
            drawPolylineIntoPath(
                path,
                this.flatten(),
                transform,
                startNewSubpath,
            );
        },
        flatten(step = RENDER_SAMPLE_STEP) {
            const steps = Math.max(
                    18,
                    Math.ceil(estimateControlPolygonLength(this.cps) / step),
                ),
                minT = this.knots[this.degree],
                maxT = this.knots[this.knots.length - this.degree - 1],
                points = [];
            for (let i = 0; i <= steps; i += 1)
                points.push(
                    evaluateBSplinePoint(
                        this.degree,
                        this.knots,
                        this.cps,
                        i === steps ? maxT : minT + (maxT - minT) * (i / steps),
                    ),
                );
            return points;
        },
    };
}
export function polylineSegmentFromPoints(
    points,
    entity,
    sourceEntityIndex = -1,
) {
    const resolved =
            sourceEntityIndex >= 0
                ? sourceEntityIndex
                : (entity?.__sourceEntityIndex ?? -1),
        start = points[0],
        end = points[points.length - 1];
    return {
        kind: 'polyline',
        sourceEntityIndex: resolved,
        start,
        end,
        reverse() {
            return polylineSegmentFromPoints(
                points.slice().reverse(),
                entity,
                resolved,
            );
        },
        draw(path, transform, _scale = 1, startNewSubpath = true) {
            drawPolylineIntoPath(path, points, transform, startNewSubpath);
        },
        flatten() {
            return points.map(clonePoint);
        },
    };
}
