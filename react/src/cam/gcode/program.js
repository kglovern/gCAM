import { laserLeadEndpoints } from '../laser-leads.js';
import { laserOvercutPoints } from '../laser-overcut.js';
import { fitArcRun } from './fit-arc.js';
import {
    validateLaserRotary,
    laserRotaryScale,
    laserRotaryMove,
    laserRotaryPosition,
    laserInverseFeed,
} from '../laser-rotary.js';
/**
 * Purpose: Implementation module for program in the cam domain.
 */
/**
 * GRBL program assembly for completed toolpaths.
 *
 * Toolpath construction remains in cam-ops; this module owns only the final
 * machine program and its contour/motion emitters.
 */
import {
    dist,
    pointAtDistance,
    polylineLength,
} from '../../geometry/primitives.js';
import { boundsOfPoints } from '../../geometry/bounds.js';
import { formatNumber } from './format.js';
import { validateToolpaths } from '../gcode-validation.js';
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    operationUsesTabs,
    tabTopDepth,
} from '../tabs.js';
import { getToolpathEmission } from '../operations/registry.js';
import {
    emitContourWithTabRamps,
    emitProfileContourMoves,
    emitHelicalContourEntry,
    emitVCarveMoves,
    getProfileStartPoint,
} from './contours.js';

export function buildGcode({
    toolpaths,
    fileName,
    forcePolylineArcs,
    onProgress = () => {},
}) {
    validateToolpaths(toolpaths);
    const lines = [
        '(gCAM GRBL output)',
        `(${fileName || 'untitled.dxf'})`,
        'G21',
        'G90',
        'G17',
    ];

    const totalSteps = Math.max(
        1,
        toolpaths.reduce((count, toolpath) => {
            if (getToolpathEmission(toolpath) === 'vcarve') {
                return count + Math.max(1, (toolpath.motionPaths || []).length);
            }
            return (
                count +
                Math.max(
                    1,
                    toolpath.passDepths.length *
                        Math.max(1, toolpath.previewContours.length),
                )
            );
        }, 0),
    );
    let completedSteps = 0;
    let currentToolNumber = null;
    let spindleRunning = false;
    let currentSpindle = null;
    const reportProgress = (label) => {
        completedSteps += 1;
        onProgress(
            Math.min(99, Math.round((completedSteps / totalSteps) * 100)),
            label,
        );
    };

    for (const toolpath of toolpaths) {
        const emission = getToolpathEmission(toolpath);
        const safeZ = toolpath.safeZ;
        const feed = toolpath.feedRate;
        const plunge = toolpath.plungeRate;
        const spindle = toolpath.spindle;
        const toolNumber = Number.isFinite(toolpath.toolNumber)
            ? Math.max(1, Math.round(toolpath.toolNumber))
            : null;
        lines.push(`(${toolpath.operationLabel} - ${toolpath.label})`);
        if (toolpath.laserPaths) {
            const rotary = validateLaserRotary(toolpath.laserRotary);
            if (rotary)
                lines.push(
                    `(Laser rotary ${rotary.type} axis ${rotary.axis} scale ${laserRotaryScale(rotary)} diameter ${rotary.objectDiameter})`,
                );
            const constantPower =
                toolpath.laserOptions.powerMode === 'constant';
            lines.push(constantPower ? 'M3 S0' : 'M4 S0');
            if (toolpath.laserOptions.airAssist) lines.push('M8');
            const focus =
                toolpath.laserFocusTest?.mode === 'sweep'
                    ? toolpath.laserFocusTest
                    : null;
            let currentFocusZ = null;
            for (let pass = 0; pass < toolpath.laserOptions.passes; pass++) {
                if (!toolpath.laserPassCount)
                    lines.push(`(Laser pass ${pass + 1})`);
                for (const path of toolpath.laserPaths) {
                    if (
                        Number.isInteger(path.laserPassStart) &&
                        path.laserPassStart > 0 &&
                        path.laserPassStart <= 100
                    )
                        lines.push(`(Laser pass ${path.laserPassStart})`);
                    if (path.points.length < 2) continue;
                    const overcut =
                        toolpath.operation === 'laser-cut' &&
                        pass === toolpath.laserOptions.passes - 1
                            ? laserOvercutPoints(
                                  path.points,
                                  toolpath.laserOptions.overcut ?? 0,
                              )
                            : undefined;
                    const leads =
                        toolpath.operation === 'laser-cut'
                            ? laserLeadEndpoints(
                                  path,
                                  toolpath.laserOptions,
                                  toolpath.laserPower,
                                  overcut,
                              )
                            : {};
                    const start = leads.entry ?? path.points[0];
                    const changeFocus =
                        focus && currentFocusZ !== path.focusZMm;
                    if (changeFocus)
                        lines.push(
                            'G1 S0',
                            `G1 Z${formatNumber(focus.travelZMm)} F${formatNumber(focus.zFeedMmMin)} S0`,
                        );
                    if (rotary?.axis === 'A') lines.push('G94');
                    const rotaryStart = rotary
                        ? laserRotaryPosition(start, rotary)
                        : null;
                    const travel = rotary
                        ? `G0 X${formatNumber(start.x)} ${rotary.axis}${formatNumber(rotaryStart.rotation)}`
                        : `G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`;
                    if (constantPower) lines.push(`${travel} S0`);
                    else
                        lines.push(
                            rotary?.axis === 'A' ? 'S0' : 'G1 S0',
                            travel,
                        );
                    if (changeFocus) {
                        lines.push(
                            `G1 Z${formatNumber(path.focusZMm)} F${formatNumber(focus.zFeedMmMin)} S0`,
                        );
                        currentFocusZ = path.focusZMm;
                    }
                    if (rotary?.axis === 'A') lines.push('G93');
                    let previousX = formatNumber(start.x),
                        previousY = formatNumber(start.y),
                        previousPoint = start;
                    const entryOffset = leads.entry ? 1 : 0;
                    const contourCount =
                        path.points.length + (overcut ? overcut.length - 1 : 0);
                    const pointCount =
                        contourCount + entryOffset + (leads.exit ? 1 : 0);
                    for (let i = 1; i < pointCount; i++) {
                        const arc =
                            !forcePolylineArcs &&
                            !rotary &&
                            !leads.entry &&
                            !leads.exit &&
                            !overcut &&
                            toolpath.operation === 'laser-cut' &&
                            fitArcRun(path.points, i - 1);
                        if (arc) {
                            const end = path.points[arc.end];
                            lines.push(
                                `${arc.command} X${formatNumber(end.x)} Y${formatNumber(end.y)} I${arc.i} J${arc.j} S${Math.round(end.power)} F${formatNumber(path.feed ?? toolpath.laserFeed)}`,
                            );
                            previousX = formatNumber(end.x);
                            previousY = formatNumber(end.y);
                            previousPoint = end;
                            i = arc.end;
                            continue;
                        }
                        const index = i - entryOffset;
                        const p =
                                entryOffset && i === 1
                                    ? {
                                          ...path.points[0],
                                          power: toolpath.laserPower,
                                      }
                                    : index >= contourCount
                                      ? leads.exit
                                      : index < path.points.length
                                        ? path.points[index]
                                        : overcut[
                                              index - path.points.length + 1
                                          ],
                            feed = path.feed ?? toolpath.laserFeed;
                        if (rotary) {
                            const move = laserRotaryMove(
                                previousPoint,
                                p,
                                feed,
                                rotary,
                            );
                            if (move)
                                lines.push(
                                    `G1 X${formatNumber(move.x)} ${rotary.axis}${formatNumber(move.rotation)} S${Math.round(p.power)} F${rotary.axis === 'A' ? laserInverseFeed(move.feed) : formatNumber(move.feed)}`,
                                );
                        } else {
                            const x =
                                    p.x === previousPoint.x
                                        ? previousX
                                        : formatNumber(p.x),
                                y =
                                    p.y === previousPoint.y
                                        ? previousY
                                        : formatNumber(p.y);
                            let line = 'G1';
                            if (x !== previousX || y === previousY)
                                line += ` X${x}`;
                            if (y !== previousY) line += ` Y${y}`;
                            // Retain G1 and explicit power for inline-laser dialects; reset feed after every rapid.
                            line += ` S${Math.round(p.power)}`;
                            if (i === 1) line += ` F${formatNumber(feed)}`;
                            lines.push(line);
                            previousX = x;
                            previousY = y;
                        }
                        previousPoint = p;
                    }
                }
            }
            if (rotary?.axis === 'A') lines.push('G94');
            if (toolpath.laserFocusTest) lines.push('G1 S0');
            if (focus)
                lines.push(
                    `G1 Z${formatNumber(focus.travelZMm)} F${formatNumber(focus.zFeedMmMin)} S0`,
                );
            lines.push('M5');
            if (toolpath.laserOptions.airAssist) lines.push('M9');
            spindleRunning = false;
            currentSpindle = null;
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }
        const requiresToolChange =
            !['laser-cut', 'laser-raster'].includes(emission) &&
            toolNumber &&
            toolNumber !== currentToolNumber;
        if (requiresToolChange) {
            lines.push(`G0 Z${formatNumber(safeZ)}`);
            if (spindleRunning) {
                lines.push('M5');
                spindleRunning = false;
            }
            const toolLabel = buildToolLabel(toolpath);
            lines.push(
                toolLabel
                    ? `T${toolNumber} M6 (${toolLabel})`
                    : `T${toolNumber} M6`,
            );
            currentToolNumber = toolNumber;
        }

        if (emission === 'vcarve') {
            emitVCarveMoves(lines, toolpath, feed, plunge, safeZ, {
                spindle,
                spindleState: {
                    running: spindleRunning,
                    speed: currentSpindle,
                },
            });
            spindleRunning = true;
            currentSpindle = spindle;
            reportProgress(`Writing ${toolpath.operationLabel}`);
            lines.push(`G0 Z${formatNumber(safeZ)}`);
            continue;
        }

        if (emission === 'laser-cut') {
            // Laser cut: M4 once, G0 travel, G1 F S cut (no Z)
            if (!spindleRunning || currentSpindle !== toolpath.laserPower) {
                if (spindleRunning) lines.push('M5');
                lines.push(`M4 S0`);
                spindleRunning = true;
                currentSpindle = toolpath.laserPower;
            }
            for (const contour of toolpath.previewContours) {
                if (!contour.length) continue;
                const start = contour[0];
                lines.push(
                    `G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`,
                );
                lines.push(
                    `G1 F${formatNumber(toolpath.laserFeed || feed)} S${Math.round(toolpath.laserPower ?? 1000)}`,
                );
                for (let i = 1; i < contour.length; i++) {
                    const p = contour[i];
                    lines.push(
                        `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)}`,
                    );
                }
            }
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }
        if (emission === 'countersink') {
            for (const path of toolpath.motionPaths || []) {
                const [surface, target] = path.points || [];
                if (!surface || !target) continue;
                lines.push(`G0 Z${formatNumber(safeZ)}`);
                lines.push(
                    `G0 X${formatNumber(surface.x)} Y${formatNumber(surface.y)}`,
                );
                if (!spindleRunning || currentSpindle !== spindle) {
                    if (spindleRunning) lines.push('M5');
                    lines.push(`M3 S${Math.round(spindle)}`);
                    spindleRunning = true;
                    currentSpindle = spindle;
                }
                lines.push(
                    `G1 Z${formatNumber(target.z)} F${formatNumber(plunge)}`,
                );
                lines.push(`G0 Z${formatNumber(safeZ)}`);
            }
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }
        if (
            emission === 'laser-raster' ||
            emission === 'wavy-raster' ||
            emission === 'halftone'
        ) {
            const isWavy = emission === 'wavy-raster';
            const isHalftone = emission === 'halftone';
            const isWavyHalftone = isWavy || isHalftone;
            // bitmap raster: need image data from source entity — try multiple sources (worker vs main)
            let bitmapEnt = null;
            // try _sourceEntities first (if passed from main)
            const tryFind = (entities) => {
                if (!entities) return null;
                for (const e of entities)
                    if (e?.type === 'BITMAP' && e._imageData) return e;
                return null;
            };
            bitmapEnt = tryFind(toolpath._sourceEntities);
            if (!bitmapEnt) {
                const srcIdx =
                    toolpath.sourceLoops?.[0]?.sourceEntityIndexes?.[0];
                const ent =
                    srcIdx != null
                        ? toolpath._sourceEntities?.[srcIdx] || null
                        : null;
                if (ent?.type === 'BITMAP' && ent._imageData) bitmapEnt = ent;
            }
            if (!bitmapEnt) {
                // fallback: find BITMAP in global state if available (main thread)
                try {
                    const globalEnts =
                        (typeof window !== 'undefined' &&
                            window.GCAM_STATE?.entities) ||
                        (typeof self !== 'undefined' &&
                            self.GCAM_STATE?.entities) ||
                        null;
                    if (globalEnts) bitmapEnt = tryFind(globalEnts);
                } catch {}
            }
            if (!bitmapEnt) {
                // last fallback: try to find any BITMAP in toolpath sourceLoops via global state
                for (const l of toolpath.sourceLoops || []) {
                    const ei = l.sourceEntityIndexes?.[0];
                    // try global state
                    try {
                        const ge =
                            (typeof window !== 'undefined'
                                ? window.GCAM_STATE?.entities?.[ei]
                                : null) || null;
                        if (ge?.type === 'BITMAP' && ge._imageData) {
                            bitmapEnt = ge;
                            break;
                        }
                    } catch {}
                    const e2 =
                        ei != null ? toolpath._sourceEntities?.[ei] : null;
                    if (e2?.type === 'BITMAP' && e2._imageData) {
                        bitmapEnt = e2;
                        break;
                    }
                }
            }
            if (!bitmapEnt || !bitmapEnt._imageData) {
                // still no data — try to use previewContours as fallback (draw scan lines without image sampling, use uniform power)
                if (
                    toolpath.previewContours &&
                    toolpath.previewContours.length
                ) {
                    // fallback: just emit preview contours as G1 moves
                    for (const contour of toolpath.previewContours) {
                        if (!contour.length) continue;
                        const s = contour[0];
                        lines.push(
                            `G0 X${formatNumber(s.x)} Y${formatNumber(s.y)}`,
                        );
                        for (let i = 1; i < contour.length; i++) {
                            const p = contour[i];
                            if (isWavy)
                                lines.push(
                                    `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)} Z${formatNumber(-toolpath.wavyMaxDepth || -3)} F${formatNumber(toolpath.wavyFeed || 1000)}`,
                                );
                            else
                                lines.push(
                                    `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)} S${Math.round(toolpath.laserSMax ?? 1000)} F${formatNumber(toolpath.laserFeed || 3000)}`,
                                );
                        }
                    }
                    reportProgress(`Writing ${toolpath.operationLabel}`);
                    continue;
                }
                lines.push(
                    `(No bitmap data for ${toolpath.operationLabel} - image not loaded)`,
                );
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            // header for laser/wavy raster
            if (
                !spindleRunning ||
                (isWavy
                    ? currentSpindle !== 0
                    : currentSpindle !== toolpath.laserPower)
            ) {
                if (spindleRunning) lines.push('M5');
                if (isWavy) {
                    lines.push(`M3 S${Math.round(spindle)}`);
                    spindleRunning = true;
                    currentSpindle = 0;
                } else {
                    lines.push(`M4 S0`);
                    spindleRunning = true;
                    currentSpindle = toolpath.laserPower;
                }
            }
            // generate rasters: reuse simplelaser logic simplified — for wavy/halftone map luma to Z/hole size
            const b = bitmapEnt?.bounds ||
                toolpath.sourceLoops?.[0]?.bounds ||
                (toolpath.sourceLoops?.[0]?.points && {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 10,
                }) || { minX: 0, minY: 0, maxX: 10, maxY: 10 };
            if (
                !b ||
                !Number.isFinite(b.minX) ||
                !Number.isFinite(b.maxX) ||
                b.maxX <= b.minX
            ) {
                console.warn('[laser-raster] missing bounds', b, toolpath);
                lines.push(
                    `(Skipped ${toolpath.operationLabel} - missing bounds)`,
                );
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            // Halftone special: grid of holes sized by luma, depth via v-bit
            if (isHalftone) {
                const res = Math.max(
                    2,
                    Math.min(100, Number(toolpath.halftoneResolution) || 25),
                );
                const invert = !!toolpath.halftoneInvert;
                const w = b.maxX - b.minX,
                    h = b.maxY - b.minY;
                const cols = Math.round(res * (w / Math.max(w, h)));
                const rows = Math.round(res * (h / Math.max(w, h)));
                const sx = w / cols,
                    sy = h / rows;
                const maxHole = Math.min(sx, sy) * 0.8;
                const angleRad = ((toolpath.cutterAngle || 90) * Math.PI) / 180;
                const depthForWidth = (width) =>
                    width / 2 / Math.tan(angleRad / 2);
                const img2 = bitmapEnt._imageData;
                const iw2 = img2.width,
                    ih2 = img2.height,
                    data2 = img2.data;
                const luma2 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = b.minX + (c + 0.5) * sx;
                        const y = b.minY + (r + 0.5) * sy;
                        const u = Math.floor(
                            ((x - b.minX) / (b.maxX - b.minX)) * iw2,
                        );
                        const v = Math.floor(
                            ((b.maxY - y) / (b.maxY - b.minY)) * ih2,
                        );
                        const idx =
                            (Math.min(ih2 - 1, Math.max(0, v)) * iw2 +
                                Math.min(iw2 - 1, Math.max(0, u))) *
                            4;
                        const lum =
                            luma2(data2[idx], data2[idx + 1], data2[idx + 2]) /
                            255;
                        const hole = invert
                            ? maxHole * lum
                            : maxHole * (1 - lum);
                        if (hole < 0.1) continue;
                        const depth = depthForWidth(hole);
                        lines.push(
                            `G0 X${formatNumber(x)} Y${formatNumber(y)}`,
                        );
                        lines.push(
                            `G1 Z${formatNumber(-depth)} F${formatNumber(toolpath.plungeRate || feed)}`,
                        );
                        lines.push(`G0 Z${formatNumber(safeZ)}`);
                    }
                }
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            const spot = isWavy
                ? toolpath.wavySpot || 2
                : toolpath.laserSpot || 0.2;
            const feed = isWavy
                ? toolpath.wavyFeed || feed
                : toolpath.laserFeed || 3000;
            const img = bitmapEnt._imageData;
            const iw = img.width,
                ih = img.height,
                data = img.data;
            const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
            const overscan = Math.max(0, Number(toolpath.laserOverscan) || 0);
            const scanMinX = b.minX - overscan;
            const scanMaxX = b.maxX + overscan;
            const cols = Math.max(1, Math.ceil((scanMaxX - scanMinX) / spot));
            const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / spot));
            for (let r = 0; r < rows; r++) {
                const y = b.minY + (r + 0.5) * spot;
                if (y < b.minY || y > b.maxY) continue;
                lines.push(`G0 X${formatNumber(scanMinX)} Y${formatNumber(y)}`);
                for (let c = 0; c < cols; c++) {
                    const x = scanMinX + (c + 0.5) * spot;
                    const sampleX = Math.min(b.maxX, Math.max(b.minX, x));
                    const u = Math.floor(
                        ((sampleX - b.minX) / (b.maxX - b.minX)) * iw,
                    );
                    const v = Math.floor(
                        ((b.maxY - y) / (b.maxY - b.minY)) * ih,
                    );
                    const idx =
                        (Math.min(ih - 1, Math.max(0, v)) * iw +
                            Math.min(iw - 1, Math.max(0, u))) *
                        4;
                    const lum = luma(data[idx], data[idx + 1], data[idx + 2]);
                    if (isWavy) {
                        const minD = toolpath.wavyMinDepth || 0,
                            maxD = toolpath.wavyMaxDepth || 3;
                        const z = -(minD + (1 - lum / 255) * (maxD - minD));
                        // wavy: vary Z along X, G1 Z depth (laser off, CNC)
                        if (c === 0)
                            lines.push(
                                `G1 Z${formatNumber(z)} F${formatNumber(feed)}`,
                            );
                        lines.push(
                            `G1 X${formatNumber(x)} Z${formatNumber(z)} F${formatNumber(feed)}`,
                        );
                    } else {
                        const sMin = toolpath.laserSMin || 0,
                            sMax = toolpath.laserSMax ?? 1000;
                        const gamma = toolpath.laserGamma || 1;
                        let v2 = lum;
                        if (gamma !== 1) v2 = 255 * Math.pow(v2 / 255, gamma);
                        const s = Math.round(
                            sMin + (1 - v2 / 255) * (sMax - sMin),
                        );
                        lines.push(
                            `G1 X${formatNumber(x)} S${s} F${formatNumber(feed)}`,
                        );
                    }
                }
            }
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }

        let startedThisToolpath = false;
        const contourDepths = new Map();
        for (const [contourIndex, depth] of contourPasses(toolpath)) {
            const contour = toolpath.previewContours[contourIndex];
            if (!contour.length) {
                continue;
            }

            const start = getProfileStartPoint(contour, toolpath);
            lines.push(`G0 Z${formatNumber(safeZ)}`);
            lines.push(
                `G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`,
            );
            if (
                !startedThisToolpath ||
                !spindleRunning ||
                currentSpindle !== spindle
            ) {
                lines.push(`M3 S${Math.round(spindle)}`);
                spindleRunning = true;
                currentSpindle = spindle;
                startedThisToolpath = true;
            }

            const tabsForContour = operationUsesTabs(toolpath)
                ? toolpath.tabs
                      .filter((tab) => tab.contourIndex === contourIndex)
                      .sort((a, b) => a.along - b.along)
                : [];

            const fixedTabDepth = tabTopDepth(toolpath);
            const passUsesTabs =
                tabsForContour.length > 0 && depth < fixedTabDepth;

            const canHelix =
                toolpath.helicalEntryEnabled &&
                !passUsesTabs &&
                (toolpath.operation === 'profile-inside' ||
                    toolpath.operation === 'profile-outside' ||
                    toolpath.operation === 'pocket');
            const entryDepth = contourDepths.get(contourIndex) ?? 0;
            const helicalEntry =
                canHelix &&
                emitHelicalContourEntry(
                    lines,
                    contour,
                    entryDepth,
                    depth,
                    feed,
                );

            if (!passUsesTabs) {
                if (!helicalEntry) {
                    lines.push(
                        `G1 Z${formatNumber(depth)} F${formatNumber(plunge)}`,
                    );
                }
                emitProfileContourMoves(
                    lines,
                    contour,
                    depth,
                    feed,
                    plunge,
                    forcePolylineArcs,
                    toolpath,
                );
                contourDepths.set(contourIndex, depth);
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }

            lines.push(`G1 Z${formatNumber(depth)} F${formatNumber(plunge)}`);
            emitContourWithTabRamps(
                lines,
                contour,
                depth,
                fixedTabDepth,
                tabsForContour,
                toolpath,
                feed,
                forcePolylineArcs,
            );
            contourDepths.set(contourIndex, depth);
            reportProgress(`Writing ${toolpath.operationLabel}`);
        }
        lines.push(`G0 Z${formatNumber(safeZ)}`);
    }

    if (spindleRunning) {
        lines.push('M5');
    }
    lines.push('M30');
    return lines.join('\n');
}

function* contourPasses(toolpath) {
    const contours = toolpath.previewContours;
    const depths = toolpath.passDepths;
    if (
        toolpath.operation === 'profile-inside' ||
        toolpath.operation === 'profile-outside'
    ) {
        for (
            let contourIndex = 0;
            contourIndex < contours.length;
            contourIndex++
        ) {
            for (const depth of depths) yield [contourIndex, depth];
        }
        return;
    }

    for (const depth of depths) {
        for (
            let contourIndex = 0;
            contourIndex < contours.length;
            contourIndex++
        ) {
            yield [contourIndex, depth];
        }
    }
}

export async function buildGcodeAsync({
    toolpaths,
    fileName,
    forcePolylineArcs,
    onProgress = () => {},
}) {
    // Keep the worker responsive while preserving the synchronous public output.
    return new Promise((resolve, reject) => {
        try {
            let lastYield = 0;
            const yieldingProgress = (percent, label) => {
                onProgress(percent, label);
                const now = performance.now();
                if (now - lastYield > 50) {
                    lastYield = now;
                    setTimeout(() => {}, 0);
                }
            };
            const result = buildGcode({
                toolpaths,
                fileName,
                forcePolylineArcs,
                onProgress: yieldingProgress,
            });
            onProgress(100, 'G-code ready');
            resolve(result);
        } catch (error) {
            reject(error);
        }
    });
}

// Comment text for the T# M6 line. Parens are stripped because GRBL
// comments cannot nest.
function buildToolLabel(toolpath) {
    const hasDiameter = Number.isFinite(toolpath.toolDiameter);
    const namedTool = (toolpath.libraryToolName || '').trim();
    let label = '';
    if (namedTool) {
        label = hasDiameter
            ? `${namedTool} - ${formatNumber(toolpath.toolDiameter)}mm`
            : namedTool;
    } else if (
        (toolpath.operation === 'vcarve' || toolpath.operation === 'chamfer') &&
        Number.isFinite(toolpath.cutterAngle)
    ) {
        label = `${formatNumber(toolpath.cutterAngle)}deg V-bit`;
    } else if (hasDiameter) {
        label = `${formatNumber(toolpath.toolDiameter)}mm tool`;
    }
    return label.replace(/[()]/g, '').trim();
}
