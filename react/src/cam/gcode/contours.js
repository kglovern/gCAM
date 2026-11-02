/**
 * Purpose: Implementation module for contours in the cam domain.
 */
/**
 * Contour-level GRBL moves shared by profile, tabbed, V-carve, and trochoidal
 * program emission.
 */
import {
    dist,
    pointAtDistance,
    polylineLength,
} from '../../geometry/primitives.js';
import { formatNumber } from './format.js';
import { fitArcRun } from './fit-arc.js';
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    operationUsesTabs,
    tabTopDepth,
} from '../tabs.js';

export function emitVCarveMoves(
    lines,
    toolpath,
    feed,
    plunge,
    safeZ,
    options = {},
) {
    const spindle = options.spindle;
    const spindleState = options.spindleState || {
        running: false,
        speed: null,
    };
    let started = false;
    for (const path of toolpath.motionPaths || []) {
        if (!path.points?.length) {
            continue;
        }
        const [start, ...rest] = path.points;
        lines.push(`G0 Z${formatNumber(safeZ)}`);
        lines.push(`G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`);
        if (
            !started ||
            !spindleState.running ||
            spindleState.speed !== spindle
        ) {
            lines.push(`M3 S${Math.round(spindle)}`);
            spindleState.running = true;
            spindleState.speed = spindle;
            started = true;
        }
        lines.push(`G1 Z${formatNumber(start.z)} F${formatNumber(plunge)}`);

        let previous = start;
        for (const point of rest) {
            const sameXY =
                Math.abs(point.x - previous.x) < 0.0001 &&
                Math.abs(point.y - previous.y) < 0.0001;
            if (sameXY) {
                const rate = point.z < previous.z ? plunge : feed;
                lines.push(
                    `G1 Z${formatNumber(point.z)} F${formatNumber(rate)}`,
                );
            } else {
                lines.push(
                    `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(point.z)} F${formatNumber(feed)}`,
                );
            }
            previous = point;
        }
    }
}

function emitContourMoves(
    lines,
    contour,
    depth,
    feed,
    plunge,
    forcePolylineArcs,
) {
    if (contour.length < 2) {
        return;
    }
    for (let i = 1; i < contour.length; i += 1) {
        const arc = !forcePolylineArcs && fitArcRun(contour, i - 1);
        if (arc) {
            const end = contour[arc.end];
            lines.push(
                `${arc.command} X${formatNumber(end.x)} Y${formatNumber(end.y)} I${arc.i} J${arc.j} F${formatNumber(feed)}`,
            );
            i = arc.end;
            continue;
        }
        const point = contour[i];
        lines.push(
            `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} F${formatNumber(feed)}`,
        );
    }
}

/** Ramp down by repeating the compensated contour; XY never leaves the cut path. */
export function emitHelicalContourEntry(
    lines,
    contour,
    startDepth,
    targetDepth,
    feed,
) {
    if (contour.length < 3 || !(startDepth > targetDepth)) return false;
    const total = polylineLength(contour);
    if (!(total > 0)) return false;
    const drop = startDepth - targetDepth;
    const maxDropPerLap = total * Math.tan((5 * Math.PI) / 180);
    const laps = Math.max(1, Math.ceil(drop / Math.max(0.05, maxDropPerLap)));
    if (laps > 1000) return false;
    for (let lap = 0; lap < laps; lap += 1) {
        let walked = 0;
        for (let index = 1; index < contour.length; index += 1) {
            const previous = contour[index - 1];
            const point = contour[index];
            walked += dist(previous, point);
            const progress = (lap + walked / total) / laps;
            const z = startDepth - drop * progress;
            lines.push(
                `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(z)} F${formatNumber(feed)}`,
            );
        }
    }
    return true;
}

export function emitProfileContourMoves(
    lines,
    contour,
    depth,
    feed,
    plunge,
    forcePolylineArcs,
    toolpath,
) {
    if (toolpath.trochoidEnabled && toolpath.trochoidRadius > 0) {
        emitTrochoidalContourMoves(
            lines,
            contour,
            depth,
            feed,
            toolpath.trochoidRadius,
            null,
            forcePolylineArcs,
        );
        return;
    }
    emitContourMoves(lines, contour, depth, feed, plunge, forcePolylineArcs);
}

export function emitContourWithTabRamps(
    lines,
    contour,
    cutDepth,
    tabDepth,
    tabs,
    toolpath,
    feed,
    forcePolylineArcs,
) {
    const total = polylineLength(contour);
    const rampLength = Math.max(toolpath.toolDiameter * 0.75, 0.5);
    const tabZones = tabs.map((tab) => {
        const width = Math.max(
            toolpath.tabWidth,
            getMinimumTabWidth(toolpath.toolDiameter),
        );
        const span = getTabCenterlineSpan(width, toolpath.toolDiameter);
        const start = Math.max(0, tab.along - span / 2);
        const end = Math.min(total, tab.along + span / 2);
        return {
            rampStart: Math.max(0, start - rampLength),
            start,
            end,
            rampEnd: Math.min(total, end + rampLength),
        };
    });
    const distances = new Set([0, total]);
    let walked = 0;
    for (let index = 1; index < contour.length - 1; index += 1) {
        walked += dist(contour[index - 1], contour[index]);
        distances.add(walked);
    }
    for (const zone of tabZones) {
        distances.add(zone.rampStart);
        distances.add(zone.start);
        distances.add(zone.end);
        distances.add(zone.rampEnd);
    }
    const lift = tabDepth - cutDepth;
    const depthAt = (along) =>
        tabZones.reduce((currentDepth, zone) => {
            let factor = 0;
            if (along >= zone.rampStart && along < zone.start) {
                factor =
                    (along - zone.rampStart) /
                    Math.max(0.0001, zone.start - zone.rampStart);
            } else if (along >= zone.start && along <= zone.end) {
                factor = 1;
            } else if (along > zone.end && along <= zone.rampEnd) {
                factor =
                    1 -
                    (along - zone.end) /
                        Math.max(0.0001, zone.rampEnd - zone.end);
            }
            return Math.max(currentDepth, cutDepth + lift * factor);
        }, cutDepth);
    if (toolpath.trochoidEnabled && toolpath.trochoidRadius > 0) {
        emitTrochoidalContourMoves(
            lines,
            contour,
            cutDepth,
            feed,
            toolpath.trochoidRadius,
            depthAt,
            forcePolylineArcs,
        );
        return;
    }
    const points = Array.from(distances).sort((a, b) => a - b);
    for (const along of points.slice(1)) {
        const point = pointAtDistance(contour, along);
        lines.push(
            `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(depthAt(along))} F${formatNumber(feed)}`,
        );
    }
}

function emitTrochoidalContourMoves(
    lines,
    contour,
    depth,
    feed,
    radius,
    depthAt = null,
    forcePolylineArcs = false,
) {
    const total = polylineLength(contour);
    const advance = Math.max(radius * 0.7, 0.25);
    const samples = Math.max(1, Math.ceil(total / advance));
    const stepsPerLoop = 16;
    const zAt = (along) => (depthAt ? depthAt(along) : depth);

    for (let index = 0; index <= samples; index += 1) {
        const along = (total * index) / samples;
        const nextAlong = Math.min(total, (total * (index + 1)) / samples);
        const before = pointAtDistance(contour, Math.max(0, along - advance));
        const after = pointAtDistance(
            contour,
            Math.min(total, along + advance),
        );
        const center = pointAtDistance(contour, along);
        const tangentLength =
            Math.hypot(after.x - before.x, after.y - before.y) || 1;
        const tx = (after.x - before.x) / tangentLength;
        const ty = (after.y - before.y) / tangentLength;
        const nx = -(after.y - before.y) / tangentLength;
        const ny = (after.x - before.x) / tangentLength;

        const start = { x: center.x + nx * radius, y: center.y + ny * radius };
        const opposite = {
            x: center.x - nx * radius,
            y: center.y - ny * radius,
        };
        const midAlong = along + (nextAlong - along) / 2;

        if (index > 0) {
            lines.push(
                `G1 X${formatNumber(start.x)} Y${formatNumber(start.y)} Z${formatNumber(zAt(along))} F${formatNumber(feed)}`,
            );
        }

        if (!forcePolylineArcs) {
            // Two half arcs reliably express a complete trochoidal circle to GRBL.
            lines.push(
                `G3 X${formatNumber(opposite.x)} Y${formatNumber(opposite.y)} Z${formatNumber(zAt(midAlong))} I${formatNumber(-nx * radius)} J${formatNumber(-ny * radius)} F${formatNumber(feed)}`,
            );
            lines.push(
                `G3 X${formatNumber(start.x)} Y${formatNumber(start.y)} Z${formatNumber(zAt(nextAlong))} I${formatNumber(nx * radius)} J${formatNumber(ny * radius)} F${formatNumber(feed)}`,
            );
            continue;
        }

        for (let step = index === 0 ? 1 : 0; step <= stepsPerLoop; step += 1) {
            const progress = step / stepsPerLoop;
            const phase = progress * Math.PI * 2;
            const point = {
                x:
                    center.x +
                    (nx * Math.cos(phase) + tx * Math.sin(phase)) * radius,
                y:
                    center.y +
                    (ny * Math.cos(phase) + ty * Math.sin(phase)) * radius,
            };
            const z = zAt(along + (nextAlong - along) * progress);
            lines.push(
                `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(z)} F${formatNumber(feed)}`,
            );
        }
    }
}

export function getProfileStartPoint(contour, toolpath) {
    if (
        !toolpath.trochoidEnabled ||
        toolpath.trochoidRadius <= 0 ||
        contour.length < 2
    ) {
        return contour[0];
    }
    const start = contour[0];
    const next = contour[1];
    const length = Math.hypot(next.x - start.x, next.y - start.y) || 1;
    return {
        x: start.x - ((next.y - start.y) / length) * toolpath.trochoidRadius,
        y: start.y + ((next.x - start.x) / length) * toolpath.trochoidRadius,
    };
}
