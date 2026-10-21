/**
 * Purpose: Rotary profile editor — SVG vector canvas with draggable
 * Bezier nodes/handles, click-to-split segments, mm rulers and snap.
 * Nodes can never cross; handles repair live so spans cannot fold.
 */
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { clonePoints, fitHandles, sampleProfile } from '../engine/profileModel';

import { useProfileViewport } from './useProfileViewport';
import { useProfileGestures } from './useProfileGestures';
import type { ProfilePoint, RotaryStock } from '../engine/types';

const ML = 34;
const MR = 10;
const MT = 22;
const MB = 24;

interface DragState {
    kind: 'pt' | 'hd' | 'bg';
    i?: number;
    h?: 'h1' | 'h2';
    x0: number;
    y0: number;
    pan: number;
    moved: boolean;
}

interface ProfileEditorViewProps {
    points: ProfilePoint[];
    stock: RotaryStock;
    snap: boolean;
    sel: number;
    onSelect: (i: number) => void;
    /** Live drag updates (no history). */
    onLive: (next: ProfilePoint[]) => void;
    /** Drag end: heal + refresh. */
    onDragEnd: () => void;
    onInsert: (x: number, r: number) => void;
    onDeleteKey: () => void;
    onNudge: (dx: number, dr: number) => void;
}

export function ProfileEditorView({
    points,
    stock,
    snap,
    sel,
    onSelect,
    onLive,
    onDragEnd,
    onInsert,
    onDeleteKey,
    onNudge,
}: ProfileEditorViewProps): ReactElement {
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const panXRef = useRef(0);
    const drag = useRef<DragState | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const { width: W, height: H } = useProfileViewport(svgRef);
    const activePointer = useRef<number | null>(null);
    const stopDrag = () => {
        const previous = drag.current;
        drag.current = null;
        activePointer.current = null;
        if (previous?.kind === 'pt' || previous?.kind === 'hd') onDragEnd();
    };
    const gestures = useProfileGestures({
        svg: svgRef,
        viewWidth: W,
        zoom,
        pan: panX,
        onInterrupt: stopDrag,
        onView: (nextZoom, nextPan) => {
            setZoom(nextZoom);
            panXRef.current = nextPan;
            setPanX(nextPan);
        },
    });

    const view = useMemo(() => {
        const maxR = Math.max(stock.diameter / 2 + 2, 8);
        const maxX = Math.max(
            stock.length,
            ...points.map((p) => p.x),
            ...points.map((p) => p.h1.x),
            ...points.map((p) => p.h2.x),
        );
        return { maxR, maxX: maxX + 4 };
    }, [points, stock]);

    const X = (x: number): number =>
        ML + (x / view.maxX) * (W - ML - MR) * zoom - panXRef.current;
    const Y = (r: number): number => H - MB - (r / view.maxR) * (H - MT - MB);
    const invX = (px: number): number =>
        ((px - ML + panXRef.current) / ((W - ML - MR) * zoom)) * view.maxX;
    const invR = (py: number): number =>
        ((H - MB - py) / (H - MT - MB)) * view.maxR;

    const toLocal = (
        clientX: number,
        clientY: number,
    ): { px: number; py: number } => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) {
            return { px: 0, py: 0 };
        }
        return {
            px: ((clientX - rect.left) * W) / rect.width,
            py: ((clientY - rect.top) * H) / rect.height,
        };
    };

    const curvePath = useMemo(() => {
        const s = sampleProfile(points, 16);
        return s
            .map(
                (p, i) =>
                    `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.r).toFixed(1)}`,
            )
            .join(' ');
    }, [points, view, zoom, panX, W, H]);

    const nearCurve = (px: number, py: number): boolean => {
        const s = sampleProfile(points, 16);
        for (const p of s) {
            if (Math.hypot(X(p.x) - px, Y(p.r) - py) < 14) {
                return true;
            }
        }
        return false;
    };

    const nearPoint = (px: number, py: number): number => {
        let bi = -1;
        let bd = 10;
        points.forEach((p, i) => {
            const d = Math.hypot(X(p.x) - px, Y(p.r) - py);
            if (d < bd) {
                bd = d;
                bi = i;
            }
        });
        return bi;
    };

    const onPointerDown = (e: React.PointerEvent): void => {
        svgRef.current?.setPointerCapture(e.pointerId);
        if (gestures.begin(e)) return;
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        const { px, py } = toLocal(e.clientX, e.clientY);
        const target = e.target as SVGGElement;
        const di = target.dataset?.i;
        const dh = target.dataset?.h;
        if (di !== undefined && dh === undefined) {
            const i = Number(di);
            onSelect(i);
            drag.current = {
                kind: 'pt',
                i,
                x0: e.clientX,
                y0: e.clientY,
                pan: panXRef.current,
                moved: false,
            };
        } else if (di !== undefined) {
            const i = Number(di);
            onSelect(i);
            drag.current = {
                kind: 'hd',
                i,
                h: dh as 'h1' | 'h2',
                x0: e.clientX,
                y0: e.clientY,
                pan: panXRef.current,
                moved: false,
            };
        } else {
            drag.current = {
                kind: 'bg',
                x0: e.clientX,
                y0: e.clientY,
                pan: panXRef.current,
                moved: false,
            };
        }
    };

    const onPointerMove = (e: React.PointerEvent): void => {
        if (gestures.move(e) || activePointer.current !== e.pointerId) return;
        const d = drag.current;
        if (!d) {
            return;
        }
        const { px, py } = toLocal(e.clientX, e.clientY);
        if (d.kind === 'pt' && d.i !== undefined) {
            const next = clonePoints(points);
            const p = next[d.i];
            const loX = d.i > 0 ? next[d.i - 1].x : 0;
            const hiX = d.i < next.length - 1 ? next[d.i + 1].x : stock.length;
            let nx = Math.max(loX, Math.min(invX(px), hiX));
            let nr = Math.max(0, Math.min(invR(py), stock.diameter / 2 + 2));
            if (snap) {
                nx = Math.round(nx);
                nr = Math.round(nr);
            }
            p.x = nx;
            p.r = nr;
            fitHandles(
                next,
                [d.i - 1, d.i, d.i + 1].filter(
                    (k) => k >= 0 && k < next.length,
                ),
            );
            onLive(next);
        } else if (d.kind === 'hd' && d.i !== undefined && d.h) {
            const next = clonePoints(points);
            const p = next[d.i];
            const loH =
                d.h === 'h1' ? (d.i > 0 ? next[d.i - 1].x : -Infinity) : p.x;
            const hiH =
                d.h === 'h2'
                    ? d.i < next.length - 1
                        ? next[d.i + 1].x
                        : Infinity
                    : p.x;
            const maxR = stock.diameter / 2 + 2;
            p[d.h] = {
                x: Math.max(loH, Math.min(invX(px), hiH)),
                r: Math.max(0, Math.min(invR(py), maxR)),
            };
            if (p.type === 'sym') {
                const o = d.h === 'h1' ? 'h2' : 'h1';
                p[o] = {
                    x: 2 * p.x - p[d.h].x,
                    r: 2 * p.r - p[d.h].r,
                };
            }
            fitHandles(next, [d.i]);
            onLive(next);
        } else if (d.kind === 'bg') {
            if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
                d.moved = true;
                const nx = Math.max(0, d.pan - (e.clientX - d.x0));
                panXRef.current = nx;
                setPanX(nx);
            }
        }
    };

    const onPointerUp = (e: React.PointerEvent): void => {
        if (gestures.end(e) || activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        const d = drag.current;
        drag.current = null;
        if (!d) {
            return;
        }
        if (d.kind === 'pt' || d.kind === 'hd') {
            onDragEnd();
            return;
        }
        if (d.kind === 'bg' && !d.moved) {
            const { px, py } = toLocal(e.clientX, e.clientY);
            const pi = nearPoint(px, py);
            if (pi >= 0) {
                onSelect(pi);
            } else if (nearCurve(px, py)) {
                onInsert(Math.max(0, invX(px)), Math.max(0, invR(py)));
            }
        }
    };

    const onKeyDown = (e: React.KeyboardEvent): void => {
        const p = points[sel];
        if (!p) {
            return;
        }
        const s = e.shiftKey ? 2 : 0.5;
        if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown'
        ) {
            e.preventDefault();
            if (e.key === 'ArrowLeft') {
                onNudge(-s, 0);
            } else if (e.key === 'ArrowRight') {
                onNudge(s, 0);
            } else if (e.key === 'ArrowUp') {
                onNudge(0, s);
            } else {
                onNudge(0, -s);
            }
        }
        if (
            (e.key === 'Delete' || e.key === 'Backspace') &&
            points.length > 2
        ) {
            onDeleteKey();
        }
    };

    const selPt = points[sel];
    const stockR = stock.diameter / 2;
    const gridX: number[] = [];
    for (let gx = 0; gx <= view.maxX; gx += 10) {
        gridX.push(gx);
    }
    const gridR: number[] = [];
    for (let gr = 5; gr <= view.maxR; gr += 5) {
        gridR.push(gr);
    }

    return (
        <div className="rotary-profile-editor">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="block w-full cursor-crosshair touch-none bg-slate-950"
                tabIndex={0}
                role="application"
                aria-label="Profile editor"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={(event) => {
                    gestures.end(event);
                    stopDrag();
                }}
                onLostPointerCapture={(event) => {
                    gestures.end(event);
                    if (activePointer.current === event.pointerId) stopDrag();
                }}
                onKeyDown={onKeyDown}
            >
                {gridX.map((gx) => (
                    <line
                        key={`gx${gx}`}
                        x1={X(gx)}
                        y1={MT}
                        x2={X(gx)}
                        y2={H - MB}
                        stroke="#1d2732"
                        strokeWidth={1}
                    />
                ))}
                {gridR.map((gr) => (
                    <line
                        key={`gr${gr}`}
                        x1={ML}
                        y1={Y(gr)}
                        x2={W - MR}
                        y2={Y(gr)}
                        stroke="#1d2732"
                        strokeWidth={1}
                    />
                ))}
                <rect
                    x={X(0)}
                    y={Y(stockR)}
                    width={Math.max(2, X(stock.length) - X(0))}
                    height={Y(0) - Y(stockR)}
                    fill="none"
                    stroke="#3d4c5c"
                    strokeDasharray="4 3"
                />
                <rect
                    x={X(0)}
                    y={MT}
                    width={Math.max(2, X(stock.grip) - X(0))}
                    height={H - MT - MB}
                    fill="#e8862e22"
                    stroke="#e8862e66"
                />
                <text x={X(1)} y={MT + 10} fill="#e8862e" fontSize={9}>
                    CHUCK
                </text>
                <line
                    x1={ML}
                    y1={Y(0)}
                    x2={W - MR}
                    y2={Y(0)}
                    stroke="#55606c"
                    strokeWidth={1}
                />
                {gridX.map((gx) => (
                    <g key={`rl${gx}`}>
                        <line
                            x1={X(gx)}
                            y1={2}
                            x2={X(gx)}
                            y2={7}
                            stroke="#55606c"
                            strokeWidth={1}
                        />
                        <text x={X(gx) + 2} y={14} fill="#8fa1b1" fontSize={8}>
                            {gx}
                        </text>
                    </g>
                ))}
                {gridR.map((gr) => (
                    <g key={`rr${gr}`}>
                        <line
                            x1={ML - 6}
                            y1={Y(gr)}
                            x2={ML - 1}
                            y2={Y(gr)}
                            stroke="#55606c"
                            strokeWidth={1}
                        />
                        <text x={2} y={Y(gr) + 3} fill="#8fa1b1" fontSize={8}>
                            {gr}
                        </text>
                    </g>
                ))}
                <path
                    d={curvePath}
                    fill="none"
                    stroke="#e8862e"
                    strokeWidth={2.5}
                />
                <text x={W - MR - 40} y={H - 8} fill="#8fa1b1" fontSize={10}>
                    X → tailstock
                </text>
                <text x={4} y={MT + 8} fill="#8fa1b1" fontSize={10}>
                    R
                </text>
                {points.map((p, i) => (
                    <g key={i}>
                        {p.type !== 'corner' && (
                            <>
                                <line
                                    x1={X(p.x)}
                                    y1={Y(p.r)}
                                    x2={X(p.h1.x)}
                                    y2={Y(p.h1.r)}
                                    stroke="#5aa9e6"
                                    strokeWidth={1}
                                />
                                <line
                                    x1={X(p.x)}
                                    y1={Y(p.r)}
                                    x2={X(p.h2.x)}
                                    y2={Y(p.h2.r)}
                                    stroke="#5aa9e6"
                                    strokeWidth={1}
                                />
                                {(['h1', 'h2'] as const).map((h) => (
                                    <circle
                                        key={h}
                                        cx={X(p[h].x)}
                                        cy={Y(p[h].r)}
                                        r={4}
                                        fill="#0d1319"
                                        stroke="#5aa9e6"
                                        strokeWidth={1.5}
                                        data-i={i}
                                        data-h={h}
                                        style={{ cursor: 'move' }}
                                    />
                                ))}
                            </>
                        )}
                        <circle
                            cx={X(p.x)}
                            cy={Y(p.r)}
                            r={6}
                            fill={i === sel ? '#e8862e' : '#0d1319'}
                            stroke={i === sel ? '#fff' : '#e8862e'}
                            strokeWidth={2}
                            data-i={i}
                            style={{ cursor: 'grab' }}
                        />
                    </g>
                ))}
            </svg>
            <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 px-2 py-1">
                <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">
                    {selPt
                        ? `Point ${sel + 1} · ${selPt.type}`
                        : `${points.length} points · select a point to edit`}
                </span>
                <button
                    type="button"
                    aria-label="Zoom out"
                    className="min-h-11 min-w-11 rounded border border-slate-300 px-2.5 py-0.5 text-sm dark:border-robin-900"
                    onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))}
                >
                    −
                </button>
                <button
                    type="button"
                    aria-label="Zoom in"
                    className="min-h-11 min-w-11 rounded border border-slate-300 px-2.5 py-0.5 text-sm dark:border-robin-900"
                    onClick={() => setZoom((z) => Math.min(3, z * 1.25))}
                >
                    +
                </button>
                <button
                    type="button"
                    aria-label="Reset zoom"
                    className="min-h-11 min-w-11 rounded border border-slate-300 px-2.5 py-0.5 text-sm dark:border-robin-900"
                    onClick={() => {
                        setZoom(1);
                        panXRef.current = 0;
                        setPanX(0);
                    }}
                >
                    Fit
                </button>
            </div>
        </div>
    );
}
