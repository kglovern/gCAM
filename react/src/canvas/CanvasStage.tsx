/**
 * Purpose: Implementation module for CanvasStage in the react domain.
 */
import { useEffect, useRef, useState } from 'react';
import { useRulerGuides } from './useRulerGuides';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CanvasNavigationControls } from './CanvasNavigationControls';
import { VectorContextMenu } from './VectorContextMenu';
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    nearestPointOnPolyline,
} from '../cam/cam-ops.js';
import { pointAtDistance, polylineLength } from '../geometry/primitives.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import {
    arcPoints3,
    arcBulgeDistance,
    arcSweepDegrees,
    draftPoints,
    defaultArcBulgePoint,
    rulerStep,
    type DrawTool,
} from '../draw/geometry';
import { type TransformCommit, type TransformMode } from '../lib/transform';
import {
    findFilletCorner,
    hitTransformTarget,
    type CornerHover,
    type SelectionFrame,
    type TransformDragState,
} from './selectionGeometry';
import { fitCamera } from './camera';
import { drawRulerTicks, RULER_SIZE } from './rulers';
import { drawCanvasScene, polylineSlice } from './sceneRenderer';
import {
    paintDrawingFeedback,
    paintSelectionFeedback,
} from './paintInteractionOverlays';
import { CanvasViewport } from './CanvasViewport';
import {
    CanvasHud,
    type DraftDimension,
    type DraftDimensionField,
} from './CanvasHud';
import { DARK_CANVAS_THEME, LIGHT_CANVAS_THEME } from './theme';
import type { CanvasStageProps } from './CanvasStage.types';
import type { CanvasViewState } from './stageViewState';
import { useCanvasViewportCommands } from './useCanvasViewportCommands';
import type {
    Camera,
    LoopMeta,
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';
import { MM_PER_INCH } from '../lib/units';

/**
 * 2D canvas: fitted vector view with wheel-zoom, drag-pan (middle/right
 * button or Alt+left) and fit/zoom controls. Vectors green, toolpath
 * preview amber. Full CanvasView scene (rulers, snap, overlays) ports here.
 */
export type {
    Camera,
    LoopMeta,
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
};
export type { DrawTool } from './types';

export function CanvasStage({
    onShowProperties,
    contextActions,
    activeTool,
    additiveSelection = false,
    loops,
    bounds,
    preview,
    draftPreview,
    inspectorPreview,
    draftProgress,
    darkMode,
    selected,
    hidden,
    onSelect,
    onAdjustStock,
    tabMode,
    tabMarkers,
    onPlaceTab,
    onMoveTab,
    onDeleteTab,
    drawTool,
    drawSides,
    polygonMode,
    onPolygonSidesChange = () => {},
    onPolygonModeChange = () => {},
    grid,
    stock,
    guides,
    guidePlacement = null,
    guideDraft,
    onPlaceGuide = () => {},
    onGuideDraftChange = () => {},
    onCancelGuide = () => {},
    onDeleteGuide = () => {},
    bitmaps,
    onCommitLoop,
    onTrimAt,
    onTrimStroke,
    onCommitText,
    onCommitMandala,
    transformMode,
    onTransformCommit,
    cornerTool,
    cornerRadius,
    onFilletCorner,
    viewportCommand,
    units = 'metric',
}: CanvasStageProps) {
    const touchLayout = useMediaQuery('(pointer: coarse), (max-width: 767px)');
    const [panMode, setPanMode] = useState(false);
    useEffect(
        () => setPanMode(false),
        [drawTool, transformMode, activeTool, tabMode, guidePlacement],
    );
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const topRulerRef = useRef<HTMLCanvasElement>(null);
    const leftRulerRef = useRef<HTMLCanvasElement>(null);
    const cameraRef = useRef<Camera>({ scale: 1, tx: 0, ty: 0 });
    const rulerGuides = useRulerGuides({
        canvasRef,
        cameraRef,
        grid,
        enabled:
            activeTool === 'select' &&
            !drawTool &&
            !transformMode &&
            !cornerTool &&
            !tabMode &&
            !guidePlacement,
        onDraft: onGuideDraftChange,
        onPlace: onPlaceGuide,
        onCancel: onCancelGuide,
    });
    const panRef = useRef<{ x: number; y: number } | null>(null);
    const downRef = useRef<{ x: number; y: number } | null>(null);
    const marqueeRef = useRef<{
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    } | null>(null);
    const draftRef = useRef<{
        ax: number;
        ay: number;
        bx: number;
        by: number;
    } | null>(null);
    const clicksRef = useRef<{ x: number; y: number }[]>([]);
    const cursorRef = useRef<{ x: number; y: number } | null>(null);
    const progressPointerRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const move = (event: PointerEvent) => {
            progressPointerRef.current = {
                x: event.clientX,
                y: event.clientY,
            };
            // Repaint while a worker is running so the badge follows the
            // pointer even when the worker has not emitted its next update.
            setTick((n) => n + 1);
        };
        window.addEventListener('pointermove', move);
        return () => window.removeEventListener('pointermove', move);
    }, []);
    const trimHoverRef = useRef<{
        loopId: string;
        segmentIndex: number;
        removed?: { x: number; y: number }[];
    } | null>(null);
    const trimBrushRef = useRef<{ points: { x: number; y: number }[] } | null>(
        null,
    );
    const tabDragRef = useRef<{
        marker: TabMarker;
        along: number;
        moved: boolean;
    } | null>(null);
    const selectedTabRef = useRef<TabMarker | null>(null);
    const tabHoverRef = useRef<TabHoverCandidate | null>(null);
    // Click-click drawing anchor (first click for line/rect/polygon/circle).
    const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null);
    const angleSnapRef = useRef<number | null>(null);
    const selectedGuideRef = useRef<string | null>(null);
    const guideHoverRef = useRef<string | null>(null);
    const loopHoverRef = useRef<{
        loopId: string;
        segmentIndex: number;
    } | null>(null);
    // Live direct-manipulation transform drag (move/scale/rotate).
    const transformDragRef = useRef<TransformDragState | null>(null);
    const cornerHoverRef = useRef<CornerHover | null>(null);
    // Center-on-origin once for the empty canvas; imports fit instead.
    const centeredRef = useRef(false);
    const viewRef = useRef<CanvasViewState>({
        loops,
        bounds,
        preview,
        draftPreview,
        inspectorPreview: inspectorPreview ?? null,
        darkMode,
        activeTool,
        selected,
        hidden,
        tabMode,
        tabMarkers,
        tabHover: tabHoverRef.current,
        drawTool,
        drawSides,
        polygonMode,
        grid,
        stock,
        guides,
        guidePlacement,
        guideDraft,
        transformMode,
        cornerTool: cornerTool ?? null,
        cornerRadius: cornerRadius ?? 3,
        units,
        bitmaps,
    });
    viewRef.current = {
        loops,
        bounds,
        preview,
        draftPreview,
        inspectorPreview: inspectorPreview ?? null,
        darkMode,
        activeTool,
        selected,
        hidden,
        tabMode,
        tabMarkers,
        tabHover: tabHoverRef.current,
        drawTool,
        drawSides,
        polygonMode,
        grid,
        stock,
        guides,
        guidePlacement,
        guideDraft,
        transformMode,
        cornerTool: cornerTool ?? null,
        cornerRadius: cornerRadius ?? 3,
        units,
        bitmaps,
    };
    // Imperative canvas draws need a re-render trigger for camera changes.
    const [, setTick] = useState(0);
    const forceTick = () => setTick((n) => n + 1);
    // Latest frame renderer, invoked after every React render so canvas
    // state (loops, selection, preview, camera) always repaints.
    const renderRef = useRef<() => void>(() => {});

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Attach wheel listener with passive: false to allow preventDefault()
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            // Keep the drawing coordinate frame stable until the shape is
            // finished; trackpad wheel noise should not zoom mid-gesture.
            if (pendingAnchorRef.current || clicksRef.current.length) return;
            const rect = canvas.getBoundingClientRect();
            zoomBy(
                Math.exp(-e.deltaY * 0.002),
                e.clientX - rect.left,
                e.clientY - rect.top,
            );
        };
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        const cleanupWheel = () =>
            canvas.removeEventListener('wheel', handleWheel);

        // External coordinate rulers (camcanvas top/left ruler canvases).
        const paintRulers = () => {
            const theme = viewRef.current.darkMode
                ? DARK_CANVAS_THEME
                : LIGHT_CANVAS_THEME;
            const cam = cameraRef.current;
            const unitScale =
                viewRef.current.units === 'imperial' ? MM_PER_INCH : 1;
            const major = rulerStep(cam.scale * unitScale) * unitScale;
            const minor = major / 5;
            const top = topRulerRef.current;
            if (top) {
                const r = top.getBoundingClientRect();
                top.width = Math.max(1, Math.floor(r.width));
                top.height = RULER;
                const tctx = top.getContext('2d');
                if (tctx) {
                    tctx.fillStyle = theme.rulerBg;
                    tctx.fillRect(0, 0, top.width, top.height);
                    drawRulerTicks(
                        tctx,
                        cam,
                        'x',
                        top.width,
                        top.height,
                        minor,
                        major,
                        theme,
                        0,
                        viewRef.current.units,
                    );
                    tctx.strokeStyle = theme.rulerEdge;
                    tctx.lineWidth = 1;
                    tctx.beginPath();
                    tctx.moveTo(0, top.height - 0.5);
                    tctx.lineTo(top.width, top.height - 0.5);
                    tctx.stroke();
                }
            }
            const left = leftRulerRef.current;
            if (left) {
                const r = left.getBoundingClientRect();
                left.width = RULER;
                left.height = Math.max(1, Math.floor(r.height));
                const lctx = left.getContext('2d');
                if (lctx) {
                    lctx.fillStyle = theme.rulerBg;
                    lctx.fillRect(0, 0, left.width, left.height);
                    drawRulerTicks(
                        lctx,
                        cam,
                        'y',
                        left.width,
                        left.height,
                        minor,
                        major,
                        theme,
                        0,
                        viewRef.current.units,
                    );
                    lctx.strokeStyle = theme.rulerEdge;
                    lctx.lineWidth = 1;
                    lctx.beginPath();
                    lctx.moveTo(left.width - 0.5, 0);
                    lctx.lineTo(left.width - 0.5, left.height);
                    lctx.stroke();
                }
            }
        };

        const render = () => {
            const {
                loops,
                bounds,
                preview,
                draftPreview,
                inspectorPreview,
                darkMode,
                selected,
                hidden,
                tabMarkers,
                tabHover,
                grid,
                stock,
                bitmaps,
                guides,
                guidePlacement,
            } = viewRef.current;
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (!rect) return;
            canvas.width = Math.max(1, Math.floor(rect.width));
            canvas.height = Math.max(1, Math.floor(rect.height));
            if (!bounds && !centeredRef.current) {
                // Empty workspace: origin at canvas center, 1 unit = 1px.
                cameraRef.current = {
                    scale: 1,
                    tx: canvas.width / 2,
                    ty: canvas.height / 2,
                };
                centeredRef.current = true;
            }
            if (bounds && !centeredRef.current) {
                cameraRef.current = fitCamera(
                    bounds,
                    canvas.width,
                    canvas.height,
                );
                centeredRef.current = true;
            }
            // Expose the rendered coordinate transform for canvas automation.
            const renderedCamera = JSON.stringify(cameraRef.current);
            if (canvas.dataset.camera !== renderedCamera)
                canvas.dataset.camera = renderedCamera;
            drawCanvasScene({
                ctx,
                width: canvas.width,
                height: canvas.height,
                loops,
                hasBounds: Boolean(bounds),
                preview,
                draftPreview,
                inspectorPreview,
                theme: darkMode ? DARK_CANVAS_THEME : LIGHT_CANVAS_THEME,
                darkMode,
                selected,
                ghostedIds: transformDragRef.current?.moved ? selected : [],
                hidden,
                tabMarkers,
                tabHover,
                activeTabDrag: tabDragRef.current,
                selectedTab: selectedTabRef.current,
                camera: cameraRef.current,
                marquee: marqueeRef.current,
                draft: draftPoints(
                    viewRef.current.drawTool,
                    draftRef.current,
                    viewRef.current.drawSides,
                    viewRef.current.grid.snap
                        ? viewRef.current.grid.spacingMm
                        : null,
                    viewRef.current.polygonMode,
                ),
                grid,
                stockBounds: {
                    minX: 0,
                    minY: 0,
                    maxX: stock.widthMm,
                    maxY: stock.heightMm,
                },
                bitmaps,
                guides: viewRef.current.guides,
                guidePlacement: viewRef.current.guidePlacement,
                guideDraft: viewRef.current.guideDraft,
                guideCursor: cursorRef.current,
            });
            paintRulers();
            paintSelectionFeedback({
                ctx,
                loops,
                selected,
                hidden,
                darkMode,
                camera: cameraRef.current,
                trimHover:
                    viewRef.current.activeTool === 'trim'
                        ? trimHoverRef.current
                        : null,
                cornerTool: viewRef.current.cornerTool,
                cornerHover: cornerHoverRef.current,
                cornerRadius: viewRef.current.cornerRadius,
                transformMode: viewRef.current.transformMode,
                transformDrag: transformDragRef.current,
                clicks: [],
                cursor: null,
                drawTool: null,
                grid: viewRef.current.grid,
                guides: viewRef.current.guides,
                selectedGuideId: selectedGuideRef.current,
                guideHoverId: guideHoverRef.current,
                loopHoverId: loopHoverRef.current?.loopId ?? null,
            });
            paintDrawingFeedback({
                ctx,
                loops,
                selected,
                hidden,
                darkMode,
                camera: cameraRef.current,
                trimHover: null,
                cornerTool: null,
                cornerHover: null,
                cornerRadius: 0,
                transformMode: null,
                transformDrag: null,
                clicks: clicksRef.current,
                cursor: cursorRef.current,
                drawTool: viewRef.current.drawTool,
                draft: draftRef.current,
                drawSides: viewRef.current.drawSides,
                polygonMode: viewRef.current.polygonMode,
                grid: viewRef.current.grid,
                guides: viewRef.current.guides,
                angleSnap: angleSnapRef.current,
            });
        };
        render();
        renderRef.current = render;
        const ro = new ResizeObserver(render);
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => {
            ro.disconnect();
            cleanupWheel();
            renderRef.current = () => {};
        };
    }, []);

    // Repaint after every render â€” viewRef is refreshed during render, so
    // the canvas always reflects current loops/selection/preview/camera.
    useEffect(() => {
        renderRef.current();
    });

    // Clear partial click chains when the draw tool changes.
    useEffect(() => {
        clicksRef.current = [];
        cursorRef.current = null;
        pendingAnchorRef.current = null;
        draftRef.current = null;
    }, [drawTool]);
    useEffect(() => {
        if (!tabMode) {
            tabHoverRef.current = null;
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = '';
            renderRef.current();
        }
    }, [tabMode]);
    const { fitToBounds, zoomBy } = useCanvasViewportCommands({
        canvasRef,
        cameraRef,
        viewRef,
        viewportCommand,
        repaint: forceTick,
    });

    const updateCursor = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cam = cameraRef.current;
        cursorRef.current = {
            x: (e.clientX - rect.left - cam.tx) / cam.scale,
            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
        };
    };

    // Progress pill position: pinned near the cursor (camcanvas parity).
    const camNow = cameraRef.current;
    const pillPos =
        draftProgress && progressPointerRef.current
            ? {
                  x: progressPointerRef.current.x + 16,
                  y: progressPointerRef.current.y + 18,
              }
            : null;
    const draftDimension: DraftDimension | null = (() => {
        const polylineAnchor =
            drawTool === 'polyline'
                ? clicksRef.current[clicksRef.current.length - 1]
                : null;
        const polylineCursor =
            drawTool === 'polyline' ? cursorRef.current : null;
        const arcStart = drawTool === 'arc' ? clicksRef.current[0] : null;
        const arcEnd =
            drawTool === 'arc' && clicksRef.current.length >= 2
                ? clicksRef.current[1]
                : null;
        const arcCursor = drawTool === 'arc' ? cursorRef.current : null;
        const arcFirstPhase =
            drawTool === 'arc' &&
            clicksRef.current.length === 1 &&
            arcStart &&
            arcCursor;
        const arcBulgePhase =
            drawTool === 'arc' && arcStart && arcEnd && arcCursor;
        const draft =
            draftRef.current ??
            (arcFirstPhase
                ? {
                      ax: arcStart.x,
                      ay: arcStart.y,
                      bx: arcCursor.x,
                      by: arcCursor.y,
                  }
                : polylineAnchor && polylineCursor
                  ? {
                        ax: polylineAnchor.x,
                        ay: polylineAnchor.y,
                        bx: polylineCursor.x,
                        by: polylineCursor.y,
                    }
                  : null);
        if (arcBulgePhase && arcStart && arcEnd && arcCursor) {
            const fields: DraftDimension['fields'] = [
                {
                    key: 'bulge',
                    label: 'Bulge',
                    value:
                        units === 'imperial'
                            ? arcBulgeDistance(arcStart, arcEnd, arcCursor) /
                              MM_PER_INCH
                            : arcBulgeDistance(arcStart, arcEnd, arcCursor),
                    unit: 'length',
                },
                {
                    key: 'sweep',
                    label: 'Sweep',
                    value: arcSweepDegrees(arcStart, arcEnd, arcCursor),
                    unit: 'angle',
                },
            ];
            const x =
                camNow.tx + ((arcStart.x + arcEnd.x) * camNow.scale) / 2 + 12;
            const y =
                camNow.ty - ((arcStart.y + arcEnd.y) * camNow.scale) / 2 - 36;
            return { fields, x, y };
        }
        if (
            !draft ||
            !drawTool ||
            ![
                'rectangle',
                'circle',
                'line',
                'polygon',
                'polyline',
                'arc',
            ].includes(drawTool)
        )
            return null;
        const dx = draft.bx - draft.ax;
        const dy = draft.by - draft.ay;
        const distance = Math.hypot(dx, dy);
        if (!(distance > 0.01)) return null;
        const length = units === 'imperial' ? distance / MM_PER_INCH : distance;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const fields: DraftDimension['fields'] =
            drawTool === 'rectangle'
                ? [
                      {
                          key: 'width',
                          label: 'Width',
                          value:
                              units === 'imperial'
                                  ? Math.abs(dx) / MM_PER_INCH
                                  : Math.abs(dx),
                          unit: 'length',
                      },
                      {
                          key: 'height',
                          label: 'Height',
                          value:
                              units === 'imperial'
                                  ? Math.abs(dy) / MM_PER_INCH
                                  : Math.abs(dy),
                          unit: 'length',
                      },
                  ]
                : drawTool === 'circle' || drawTool === 'polygon'
                  ? [
                        {
                            key: 'radius',
                            label: drawTool === 'circle' ? 'Radius' : 'Radius',
                            value: length,
                            unit: 'length',
                        },
                    ]
                  : [
                        {
                            key: 'length',
                            label: 'Length',
                            value: length,
                            unit: 'length',
                        },
                        {
                            key: 'angle',
                            label: 'Angle',
                            value: angle,
                            unit: 'angle',
                        },
                    ];
        const x = camNow.tx + ((draft.ax + draft.bx) * camNow.scale) / 2 + 12;
        const y = camNow.ty - Math.max(draft.ay, draft.by) * camNow.scale - 36;
        return {
            fields,
            x,
            y,
            ...(drawTool === 'polygon'
                ? { polygon: { sides: drawSides, mode: polygonMode } }
                : {}),
        };
    })();

    const onDraftDimensionChange = (
        key: DraftDimensionField,
        value: number,
    ) => {
        const polyline = drawTool === 'polyline';
        const arc = drawTool === 'arc';
        const point = cursorRef.current;
        const anchor = polyline
            ? clicksRef.current[clicksRef.current.length - 1]
            : null;
        const arcStart = arc ? clicksRef.current[0] : null;
        const arcEnd =
            arc && clicksRef.current.length >= 2 ? clicksRef.current[1] : null;
        if (arc && arcStart && arcEnd && point) {
            const dx = arcEnd.x - arcStart.x;
            const dy = arcEnd.y - arcStart.y;
            const chord = Math.hypot(dx, dy);
            if (chord > 1e-8) {
                const cross =
                    dx * (point.y - arcStart.y) - dy * (point.x - arcStart.x);
                const side = Math.sign(cross) || 1;
                const height =
                    key === 'bulge'
                        ? Math.max(
                              0.001,
                              Math.abs(
                                  value *
                                      (units === 'imperial' ? MM_PER_INCH : 1),
                              ),
                          )
                        : (chord / 2) *
                          Math.tan(
                              (Math.min(359, Math.max(1, Math.abs(value))) *
                                  Math.PI) /
                                  720,
                          );
                const midpoint = {
                    x: (arcStart.x + arcEnd.x) / 2,
                    y: (arcStart.y + arcEnd.y) / 2,
                };
                cursorRef.current = {
                    x: midpoint.x - (dy / chord) * side * height,
                    y: midpoint.y + (dx / chord) * side * height,
                };
                forceTick();
            }
            return;
        }
        const current =
            draftRef.current ??
            (arc && arcStart && point
                ? { ax: arcStart.x, ay: arcStart.y, bx: point.x, by: point.y }
                : anchor && point
                  ? { ax: anchor.x, ay: anchor.y, bx: point.x, by: point.y }
                  : null);
        if (!current || !Number.isFinite(value)) return;
        const draft = { ...current };
        const scale = units === 'imperial' ? MM_PER_INCH : 1;
        if (drawTool === 'rectangle') {
            const width =
                key === 'width'
                    ? Math.abs(value * scale)
                    : Math.abs(draft.bx - draft.ax);
            const height =
                key === 'height'
                    ? Math.abs(value * scale)
                    : Math.abs(draft.by - draft.ay);
            draft.bx = draft.ax + Math.sign(draft.bx - draft.ax || 1) * width;
            draft.by = draft.ay + Math.sign(draft.by - draft.ay || 1) * height;
        } else if (drawTool === 'circle' || drawTool === 'polygon') {
            const radius = Math.max(0, value * scale);
            const direction = Math.atan2(
                draft.by - draft.ay,
                draft.bx - draft.ax,
            );
            draft.bx = draft.ax + Math.cos(direction) * radius;
            draft.by = draft.ay + Math.sin(direction) * radius;
        } else if (drawTool === 'line' || polyline || arc) {
            const length =
                key === 'length'
                    ? Math.max(0, value * scale)
                    : Math.hypot(draft.bx - draft.ax, draft.by - draft.ay);
            const angle =
                key === 'angle'
                    ? (value * Math.PI) / 180
                    : Math.atan2(draft.by - draft.ay, draft.bx - draft.ax);
            draft.bx = draft.ax + Math.cos(angle) * length;
            draft.by = draft.ay + Math.sin(angle) * length;
        }
        if (polyline || arc) cursorRef.current = { x: draft.bx, y: draft.by };
        else draftRef.current = draft;
        forceTick();
    };

    const onDraftDimensionCommit = () => {
        if (
            drawTool === 'arc' &&
            clicksRef.current.length === 1 &&
            cursorRef.current
        ) {
            clicksRef.current = [...clicksRef.current, cursorRef.current];
            cursorRef.current = defaultArcBulgePoint(
                clicksRef.current[0],
                clicksRef.current[1],
            );
            forceTick();
            return;
        }
        if (
            drawTool === 'arc' &&
            clicksRef.current.length >= 2 &&
            cursorRef.current
        ) {
            const points = arcPoints3(
                clicksRef.current[0],
                cursorRef.current,
                clicksRef.current[1],
            );
            clicksRef.current = [];
            cursorRef.current = null;
            if (points) onCommitLoop(points);
            forceTick();
            return;
        }
        if (drawTool === 'polyline') {
            const chain = cursorRef.current
                ? [...clicksRef.current, cursorRef.current]
                : clicksRef.current;
            if (chain.length >= 2) onCommitLoop(chain);
            clicksRef.current = [];
            cursorRef.current = null;
            forceTick();
            return;
        }
        const draft = draftRef.current;
        const anchor = pendingAnchorRef.current;
        if (!draft || !anchor || !drawTool) return;
        const points = draftPoints(
            drawTool,
            draft,
            drawSides,
            grid.snap ? grid.spacingMm : null,
            polygonMode,
        );
        pendingAnchorRef.current = null;
        draftRef.current = null;
        if (points && points.length >= 2) {
            const snapStep =
                grid.snap && grid.spacingMm > 0 ? grid.spacingMm : 0.1;
            const snap = (coordinate: number) =>
                Math.round(coordinate / snapStep) * snapStep;
            const radius = Math.hypot(
                snap(draft.bx) - snap(anchor.x),
                snap(draft.by) - snap(anchor.y),
            );
            onCommitLoop(points, {
                sourceType: drawTool,
                ...(drawTool === 'circle' || drawTool === 'polygon'
                    ? { radius }
                    : {}),
                ...(drawTool === 'polygon'
                    ? {
                          sides: Math.min(
                              128,
                              Math.max(3, Math.round(drawSides)),
                          ),
                          polygonMode,
                      }
                    : {}),
            });
        }
        forceTick();
    };

    const onDraftDimensionCancel = () => {
        clicksRef.current = [];
        cursorRef.current = null;
        pendingAnchorRef.current = null;
        draftRef.current = null;
        forceTick();
    };

    const chrome = darkMode
        ? 'bg-[#0b1220] border-robin-900'
        : 'bg-white border-slate-300';
    const chip = darkMode
        ? 'bg-dark/80 border-robin-900 text-slate-300'
        : 'bg-white/90 border-slate-300 text-slate-600';

    const jobExceedsStock = Boolean(
        bounds &&
            (bounds.minX < 0 ||
                bounds.minY < 0 ||
                bounds.maxX > stock.widthMm ||
                bounds.maxY > stock.heightMm),
    );
    const clearViewportInteraction = () => {
        marqueeRef.current = null;
        draftRef.current = null;
        cursorRef.current = null;
        trimHoverRef.current = null;
        guideHoverRef.current = null;
        loopHoverRef.current = null;
        transformDragRef.current = null;
        const canvas = canvasRef.current;
        if (canvas) canvas.style.cursor = '';
        renderRef.current();
        forceTick();
    };

    return (
        <div
            className={`h-full flex flex-col rounded border overflow-hidden ${chrome}`}
        >
            <div className="flex shrink-0">
                <div
                    aria-hidden="true"
                    style={{ width: RULER, height: RULER }}
                    className={
                        darkMode
                            ? 'bg-[#0b1220] border-b border-r border-robin-900'
                            : 'bg-slate-100 border-b border-r border-slate-300'
                    }
                />
                <canvas
                    ref={topRulerRef}
                    {...rulerGuides('top')}
                    tabIndex={0}
                    aria-label="Top ruler: drag onto the drawing to add a vertical guide"
                    title="Drag onto the drawing to add a vertical guide"
                    className="flex-1 block min-w-0"
                    style={{ height: RULER }}
                />
            </div>
            <div className="flex flex-1 min-h-0">
                <canvas
                    ref={leftRulerRef}
                    {...rulerGuides('left')}
                    tabIndex={0}
                    aria-label="Left ruler: drag onto the drawing to add a horizontal guide"
                    title="Drag onto the drawing to add a horizontal guide"
                    className="block shrink-0 self-stretch"
                    style={{ width: RULER }}
                />
                <VectorContextMenu
                    canvasRef={canvasRef}
                    cameraRef={cameraRef}
                    loops={loops}
                    bitmaps={bitmaps}
                    hidden={hidden}
                    selected={selected}
                    onSelect={onSelect}
                    onProperties={onShowProperties}
                    actions={contextActions}
                    enabled={!tabMode && !guidePlacement}
                    onMouseLeave={clearViewportInteraction}
                >
                    <CanvasViewport
                        canvasRef={canvasRef}
                        viewRef={viewRef}
                        clicksRef={clicksRef}
                        cursorRef={cursorRef}
                        draftRef={draftRef}
                        downRef={downRef}
                        panRef={panRef}
                        marqueeRef={marqueeRef}
                        cameraRef={cameraRef}
                        updateCursor={updateCursor}
                        zoomBy={zoomBy}
                        forceTick={forceTick}
                        onViewportLeave={clearViewportInteraction}
                        onCommitLoop={onCommitLoop}
                        activeTool={activeTool}
                        additiveSelection={additiveSelection}
                        panMode={panMode}
                        onCommitText={onCommitText}
                        onCommitMandala={onCommitMandala}
                        onSelect={onSelect}
                        onPlaceTab={onPlaceTab}
                        onMoveTab={onMoveTab}
                        onDeleteTab={onDeleteTab}
                        tabDragRef={tabDragRef}
                        selectedTabRef={selectedTabRef}
                        tabHoverRef={tabHoverRef}
                        progressPointerRef={progressPointerRef}
                        pendingAnchorRef={pendingAnchorRef}
                        angleSnapRef={angleSnapRef}
                        selectedGuideRef={selectedGuideRef}
                        guideHoverRef={guideHoverRef}
                        loopHoverRef={loopHoverRef}
                        onDeleteGuide={onDeleteGuide}
                        transformDragRef={transformDragRef}
                        onTransformCommit={onTransformCommit}
                        onFilletCorner={onFilletCorner}
                        cornerHoverRef={cornerHoverRef}
                        onTrimAt={onTrimAt}
                        onTrimStroke={onTrimStroke}
                        trimBrushRef={trimBrushRef}
                        onTrimHover={(hover) => {
                            trimHoverRef.current = hover;
                            renderRef.current();
                        }}
                        onPlaceGuide={onPlaceGuide}
                        onGuideDraftChange={onGuideDraftChange}
                        onCancelGuide={onCancelGuide}
                    />
                    {touchLayout && (
                        <CanvasNavigationControls
                            pan={panMode}
                            onPanChange={setPanMode}
                        />
                    )}
                    <CanvasHud
                        loopCount={loops.length}
                        darkMode={darkMode}
                        cursorRef={cursorRef}
                        guidePlacement={guidePlacement}
                        guideDraft={guideDraft}
                        camera={cameraRef.current}
                        onCancelGuide={onCancelGuide}
                        onGuideOffsetChange={(offset) => {
                            if (guideDraft) {
                                onGuideDraftChange({ ...guideDraft, offset });
                                forceTick();
                            }
                        }}
                        units={units}
                        draftProgress={draftProgress}
                        progressPosition={pillPos}
                        draftDimension={draftDimension}
                        onDraftDimensionChange={onDraftDimensionChange}
                        onDraftDimensionCommit={onDraftDimensionCommit}
                        onDraftDimensionCancel={onDraftDimensionCancel}
                        onPolygonSidesChange={onPolygonSidesChange}
                        onPolygonModeChange={onPolygonModeChange}
                        jobExceedsStock={jobExceedsStock}
                        onAdjustStock={onAdjustStock}
                        onZoom={zoomBy}
                        onFit={fitToBounds}
                    />
                </VectorContextMenu>
            </div>
        </div>
    );
}
const RULER = RULER_SIZE;
