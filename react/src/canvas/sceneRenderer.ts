/**
 * Purpose: Implementation module for sceneRenderer in the react domain.
 */
import { layerDisplayColor } from '../layers/displayColor';
import { getMinimumTabWidth, getTabCenterlineSpan } from '../cam/cam-ops.js';
import { pointAtDistance, polylineLength } from '../geometry/primitives.js';
import { drawOriginGuides, strokePoints } from './primitives';
import type { CanvasCamera } from './camera';
import { findGuideSource, type Guide, type GuideDraft } from '../lib/guides';

type Point = { x: number; y: number };

export interface CanvasSceneTheme {
    bg: string;
    grid: string;
    vector: string;
    selected: string;
    preview: string;
    draft: string;
    chain: string;
    originX: string;
    originY: string;
    originDot: string;
    originLabel: string;
    emptyText: string;
}

export interface CanvasSceneLoop {
    id: string;
    layerColor?: string;
    points: Point[];
}

export interface CanvasScenePreview {
    points: Point[];
    intensity?: number;
    tabWidth?: number;
    toolDiameter?: number;
}

export interface CanvasTabMarker {
    entryId: string;
    tabIndex: number;
    previewIndex: number;
    along: number;
}

export interface CanvasTabHover {
    spine: Point[];
    toolDiameter: number;
}

export interface CanvasSceneInput {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    loops: CanvasSceneLoop[];
    hasBounds: boolean;
    preview: CanvasScenePreview[];
    draftPreview: Point[][];
    inspectorPreview: { id: string; points: Point[] } | null;
    theme: CanvasSceneTheme;
    darkMode: boolean;
    selected: string[];
    ghostedIds?: string[];
    hidden: string[];
    tabMarkers: CanvasTabMarker[];
    tabHover: CanvasTabHover | null;
    activeTabDrag: {
        marker: CanvasTabMarker;
        along: number;
        moved: boolean;
    } | null;
    selectedTab: CanvasTabMarker | null;
    camera: CanvasCamera;
    marquee: { x0: number; y0: number; x1: number; y1: number } | null;
    draft: Point[] | null;
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    stockBounds: { minX: number; minY: number; maxX: number; maxY: number };
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
    guides: Guide[];
    guidePlacement: 'edge' | null;
    guideDraft: GuideDraft | null;
    guideCursor: Point | null;
}

/** Paint the static CAD/CAM scene. Interaction overlays are painted separately. */
export function drawCanvasScene(input: CanvasSceneInput): void {
    const {
        ctx,
        width: w,
        height: h,
        loops,
        hasBounds,
        preview,
        draftPreview,
        inspectorPreview,
        theme,
        darkMode,
        selected,
        hidden,
        tabMarkers,
        tabHover,
        activeTabDrag,
        selectedTab,
        camera: cam,
        marquee,
        draft,
        grid,
        stockBounds,
        bitmaps,
        guides,
        guidePlacement,
        guideDraft,
        guideCursor,
    } = input;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h, cam, grid, theme, stockBounds);
    drawOriginGuides(ctx, w, h, cam, theme);
    if (!loops.length || !hasBounds) {
        ctx.fillStyle = theme.emptyText;
        ctx.font = '12px system-ui';
        ctx.fillText('gCAM canvas — drop DXF/SVG here', 16, h - 16);
        drawGuides(
            ctx,
            w,
            h,
            cam,
            guides,
            guidePlacement,
            guideDraft,
            guideCursor,
            loops,
            hidden,
        );
        return;
    }
    const toScreen = (x: number, y: number) => ({
        x: cam.tx + x * cam.scale,
        y: cam.ty - y * cam.scale,
    });
    drawBitmaps(ctx, bitmaps, toScreen, cam);
    for (const loop of loops) {
        if (hidden.includes(loop.id)) continue;
        const ghosted = input.ghostedIds?.includes(loop.id);
        ctx.save();
        if (ghosted) ctx.globalAlpha = 0.25;
        ctx.strokeStyle = ghosted
            ? '#94a3b8'
            : selected.includes(loop.id)
              ? theme.selected
              : layerDisplayColor(loop.layerColor, theme.bg, theme.vector);
        ctx.lineWidth = selected.includes(loop.id) && !ghosted ? 2.5 : 1.5;
        strokePoints(ctx, loop.points, toScreen);
        ctx.restore();
    }
    if (inspectorPreview && inspectorPreview.points.length >= 2) {
        ctx.save();
        ctx.strokeStyle = theme.selected;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        strokePoints(ctx, inspectorPreview.points, toScreen);
        ctx.restore();
    }
    drawPreviewContours(ctx, preview, draftPreview, toScreen, theme);
    drawTabs(
        ctx,
        preview,
        tabMarkers,
        tabHover,
        activeTabDrag,
        selectedTab,
        toScreen,
        cam,
        darkMode,
    );
    drawMarquee(ctx, marquee);
    if (draft && draft.length >= 2) {
        ctx.strokeStyle = theme.chain;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        strokePoints(ctx, draft, toScreen);
        ctx.setLineDash([]);
    }
    drawGuides(
        ctx,
        w,
        h,
        cam,
        guides,
        guidePlacement,
        guideDraft,
        guideCursor,
        loops,
        hidden,
    );
}

function drawGuides(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: CanvasCamera,
    guides: CanvasSceneInput['guides'],
    placement: CanvasSceneInput['guidePlacement'],
    guideDraft: GuideDraft | null,
    cursor: Point | null,
    loops: CanvasSceneInput['loops'],
    hidden: string[],
): void {
    const line = (
        point: Point,
        direction: Point,
        color: string,
        width: number,
        dash: number[],
    ) => {
        const length = Math.hypot(direction.x, direction.y) || 1;
        const dx = direction.x / length;
        const dy = direction.y / length;
        const span = (w + h) / Math.max(cam.scale, 1e-6);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(
            cam.tx + (point.x - dx * span) * cam.scale,
            cam.ty - (point.y - dy * span) * cam.scale,
        );
        ctx.lineTo(
            cam.tx + (point.x + dx * span) * cam.scale,
            cam.ty - (point.y + dy * span) * cam.scale,
        );
        ctx.stroke();
    };
    for (const guide of guides) {
        if (
            !guide.point ||
            !guide.direction ||
            !Number.isFinite(guide.point.x) ||
            !Number.isFinite(guide.point.y) ||
            !Number.isFinite(guide.direction.x) ||
            !Number.isFinite(guide.direction.y)
        )
            continue;
        line(guide.point, guide.direction, 'rgba(232,121,249,0.72)', 1, [8, 5]);
    }
    if (!placement) {
        ctx.setLineDash([]);
        return;
    }
    ctx.save();
    if (guideDraft) {
        const normal = {
            x: -guideDraft.direction.y,
            y: guideDraft.direction.x,
        };
        const anchor = {
            x: guideDraft.source.x + normal.x * guideDraft.offset,
            y: guideDraft.source.y + normal.y * guideDraft.offset,
        };
        line(
            anchor,
            guideDraft.direction,
            'rgba(249,115,22,0.95)',
            1.7,
            [7, 4],
        );
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(249,115,22,0.9)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(
            cam.tx + guideDraft.source.x * cam.scale,
            cam.ty - guideDraft.source.y * cam.scale,
        );
        ctx.lineTo(
            cam.tx + anchor.x * cam.scale,
            cam.ty - anchor.y * cam.scale,
        );
        ctx.stroke();
        const sx = cam.tx + guideDraft.source.x * cam.scale;
        const sy = cam.ty - guideDraft.source.y * cam.scale;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else if (cursor) {
        const source = findGuideSource(cursor, loops, hidden, cam.scale);
        if (source) {
            // Match the guide-tool hover preview: show the full dashed guide
            // through the snapped edge/axis before the user places it.
            line(source.point, source.direction, '#e8590c', 2.4, [5, 4]);
            ctx.setLineDash([]);
            const x = cam.tx + source.point.x * cam.scale;
            const y = cam.ty - source.point.y * cam.scale;
            ctx.strokeStyle = '#ea580c';
            ctx.fillStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.font = '12px system-ui';
            const label = `Guide from ${source.label}`;
            const labelX = x + 10;
            const labelY = y - 8;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(
                labelX - 4,
                labelY - 13,
                ctx.measureText(label).width + 8,
                18,
            );
            ctx.fillStyle = '#c2410c';
            ctx.fillText(label, labelX, labelY);
        }
    }
    ctx.setLineDash([]);
    ctx.restore();
}

function drawGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: CanvasCamera,
    grid: CanvasSceneInput['grid'],
    theme: CanvasSceneTheme,
    stockBounds: CanvasSceneInput['stockBounds'],
): void {
    if (!grid.visible) return;
    const left = cam.tx + stockBounds.minX * cam.scale;
    const right = cam.tx + stockBounds.maxX * cam.scale;
    const top = cam.ty - stockBounds.maxY * cam.scale;
    const bottom = cam.ty - stockBounds.minY * cam.scale;
    const step = Math.max(4, grid.spacingMm * cam.scale);
    const firstX = left + ((step - (left % step)) % step);
    const firstY = top + ((step - (top % step)) % step);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    if (grid.style === 'dots') {
        ctx.fillStyle = theme.grid;
        ctx.beginPath();
        for (let x = firstX; x <= right; x += step)
            for (let y = firstY; y <= bottom; y += step) {
                ctx.moveTo(x + 1.1, y);
                ctx.arc(x, y, 1.1, 0, Math.PI * 2);
            }
        ctx.fill();
    } else {
        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = firstX + 0.5; x <= right; x += step) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }
        for (let y = firstY + 0.5; y <= bottom; y += step) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }
        ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left + 0.5, top + 0.5, right - left, bottom - top);
}

function drawBitmaps(
    ctx: CanvasRenderingContext2D,
    bitmaps: CanvasSceneInput['bitmaps'],
    toScreen: (x: number, y: number) => Point,
    camera: CanvasCamera,
): void {
    for (const bitmap of bitmaps) {
        if (!(bitmap.img instanceof HTMLImageElement)) continue;
        const center = toScreen(
            bitmap.x + bitmap.w / 2,
            bitmap.y + bitmap.h / 2,
        );
        try {
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(-((bitmap.rotation ?? 0) * Math.PI) / 180);
            ctx.drawImage(
                bitmap.img,
                -(bitmap.w * camera.scale) / 2,
                -(bitmap.h * camera.scale) / 2,
                bitmap.w * camera.scale,
                bitmap.h * camera.scale,
            );
            ctx.restore();
        } catch {
            /* image not yet decodable — skip frame */
        }
    }
}

function drawPreviewContours(
    ctx: CanvasRenderingContext2D,
    preview: CanvasScenePreview[],
    draftPreview: Point[][],
    toScreen: (x: number, y: number) => Point,
    theme: CanvasSceneTheme,
): void {
    ctx.strokeStyle = theme.preview;
    ctx.lineWidth = 1.25;
    for (const contour of preview) {
        ctx.globalAlpha = intensityAlpha(contour.intensity);
        strokePoints(ctx, contour.points, toScreen);
    }
    ctx.globalAlpha = 1;
    if (!draftPreview.length) return;
    ctx.save();
    ctx.strokeStyle = theme.draft;
    for (const contour of draftPreview) {
        const styled = contour as Point[] & {
            _intensity?: number;
            _solidPreview?: boolean;
        };
        ctx.lineWidth = styled._solidPreview ? 0.9 : 2;
        ctx.setLineDash(styled._solidPreview ? [] : [8, 6]);
        ctx.globalAlpha = intensityAlpha(styled._intensity);
        strokePoints(ctx, contour, toScreen);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function intensityAlpha(intensity: number | undefined): number {
    const value = Number(intensity);
    return Number.isFinite(value)
        ? 0.18 + Math.max(0, Math.min(1, value)) * 0.82
        : 1;
}

function drawTabs(
    ctx: CanvasRenderingContext2D,
    preview: CanvasScenePreview[],
    markers: CanvasTabMarker[],
    hover: CanvasTabHover | null,
    activeDrag: CanvasSceneInput['activeTabDrag'],
    selectedTab: CanvasTabMarker | null,
    toScreen: (x: number, y: number) => Point,
    camera: CanvasCamera,
    darkMode: boolean,
): void {
    const fill = darkMode ? '#34d399' : '#20c997';
    const stroke = darkMode ? '#065f46' : '#198754';
    for (const marker of markers) {
        const contour = preview[marker.previewIndex];
        if (!contour || contour.points.length < 2) continue;
        const diameter =
            Number(contour.toolDiameter) > 0 ? Number(contour.toolDiameter) : 6;
        const width =
            Number(contour.tabWidth) > 0 ? Number(contour.tabWidth) : 9;
        const span = getTabCenterlineSpan(
            Math.max(width, getMinimumTabWidth(diameter)),
            diameter,
        );
        const along =
            activeDrag?.marker.entryId === marker.entryId &&
            activeDrag.marker.tabIndex === marker.tabIndex
                ? activeDrag.along
                : marker.along;
        const spine = polylineSlice(
            contour.points,
            Math.max(0, along - span / 2),
            Math.min(polylineLength(contour.points), along + span / 2),
        );
        if (spine.length < 2) continue;
        const selected =
            selectedTab?.entryId === marker.entryId &&
            selectedTab.tabIndex === marker.tabIndex;
        const dragging =
            activeDrag?.marker.entryId === marker.entryId &&
            activeDrag.marker.tabIndex === marker.tabIndex;
        drawTabBody(
            ctx,
            spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, (diameter * camera.scale) / 2),
            fill,
            stroke,
            selected || dragging,
        );
    }
    if (hover)
        drawTabBody(
            ctx,
            hover.spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, (hover.toolDiameter * camera.scale) / 2),
            fill,
            stroke,
            true,
            0.86,
        );
}

function drawMarquee(
    ctx: CanvasRenderingContext2D,
    marquee: CanvasSceneInput['marquee'],
): void {
    if (!marquee) return;
    const x = Math.min(marquee.x0, marquee.x1),
        y = Math.min(marquee.y0, marquee.y1),
        w = Math.abs(marquee.x1 - marquee.x0),
        h = Math.abs(marquee.y1 - marquee.y0);
    if (![x, y, w, h].every(Number.isFinite)) return;
    const crossing = marquee.x1 < marquee.x0;
    ctx.fillStyle = crossing ? 'rgba(34,197,94,0.12)' : 'rgba(96,165,250,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = crossing ? 'rgba(34,197,94,0.9)' : 'rgba(96,165,250,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash(crossing ? [4, 3] : []);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
}

export function polylineSlice(
    points: Point[],
    fromDistance: number,
    toDistance: number,
): Point[] {
    if (points.length < 2) return [];
    const total = polylineLength(points);
    const from = Math.max(0, Math.min(total, fromDistance));
    const to = Math.max(from, Math.min(total, toDistance));
    const first = pointAtDistance(points, from);
    if (!first) return [];
    const result = [first];
    let walked = 0;
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1],
            end = points[index],
            length = Math.hypot(end.x - start.x, end.y - start.y);
        if (walked + length > from && walked + length < to && length > 0)
            result.push(end);
        walked += length;
    }
    const last = pointAtDistance(points, to);
    if (
        last &&
        Math.hypot(
            last.x - result[result.length - 1].x,
            last.y - result[result.length - 1].y,
        ) > 0.001
    )
        result.push(last);
    return result;
}

function drawTabBody(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    radius: number,
    fill: string,
    stroke: string,
    hovered: boolean,
    alpha = 0.92,
): void {
    if (points.length < 2) return;
    const outline = hovered ? 1.7 : 1.25;
    const minX = Math.floor(
            Math.min(...points.map((point) => point.x)) - radius - outline - 3,
        ),
        minY = Math.floor(
            Math.min(...points.map((point) => point.y)) - radius - outline - 3,
        ),
        maxX = Math.ceil(
            Math.max(...points.map((point) => point.x)) + radius + outline + 3,
        ),
        maxY = Math.ceil(
            Math.max(...points.map((point) => point.y)) + radius + outline + 3,
        );
    const scratch = document.createElement('canvas');
    scratch.width = Math.max(1, maxX - minX);
    scratch.height = Math.max(1, maxY - minY);
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    const local = points.map((point) => ({
        x: point.x - minX,
        y: point.y - minY,
    }));
    sctx.save();
    sctx.globalAlpha = alpha;
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    sctx.strokeStyle = stroke;
    sctx.lineWidth = radius * 2 + outline * 2;
    strokeScreenSpine(sctx, local);
    sctx.strokeStyle = fill;
    sctx.lineWidth = radius * 2;
    strokeScreenSpine(sctx, local);
    sctx.globalCompositeOperation = 'destination-out';
    fillScreenCircle(sctx, local[0], radius + outline + 1);
    fillScreenCircle(sctx, local[local.length - 1], radius + outline + 1);
    sctx.globalCompositeOperation = 'source-over';
    sctx.strokeStyle = stroke;
    sctx.lineWidth = outline * 2;
    strokeConcaveScreenArc(sctx, local[0], local[1], radius);
    strokeConcaveScreenArc(
        sctx,
        local[local.length - 1],
        local[local.length - 2],
        radius,
    );
    sctx.restore();
    ctx.save();
    if (hovered) {
        ctx.shadowColor = 'rgba(6,95,70,0.28)';
        ctx.shadowBlur = 8;
    }
    ctx.drawImage(scratch, minX, minY);
    ctx.restore();
}

function strokeScreenSpine(
    ctx: CanvasRenderingContext2D,
    points: Point[],
): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1)
        ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
}
function fillScreenCircle(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
}
function strokeConcaveScreenArc(
    ctx: CanvasRenderingContext2D,
    anchor: Point,
    next: Point,
    radius: number,
): void {
    const dx = next.x - anchor.x,
        dy = next.y - anchor.y,
        length = Math.hypot(dx, dy) || 1,
        ux = dx / length,
        uy = dy / length,
        nx = -uy,
        ny = ux,
        start = Math.atan2(ny, nx),
        end = Math.atan2(-ny, -nx),
        inward = Math.atan2(uy, ux),
        tau = Math.PI * 2,
        normalized = (value: number) => ((value % tau) + tau) % tau,
        ccwSpan = (normalized(start) - normalized(end) + tau) % tau,
        ccwTarget = (normalized(start) - normalized(inward) + tau) % tau;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, start, end, ccwTarget <= ccwSpan);
    ctx.stroke();
}
