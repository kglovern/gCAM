/**
 * Purpose: Implementation module for CanvasHud in the react domain.
 */
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
    displayValue,
    lengthUnit,
    MM_PER_INCH,
    type UnitSystem,
} from '../lib/units';
import type { Camera } from './types';
import type { GuideDraft } from '../lib/guides';

type Point = { x: number; y: number };
export type DraftDimensionField =
    | 'width'
    | 'height'
    | 'radius'
    | 'length'
    | 'angle'
    | 'bulge'
    | 'sweep';
export type DraftDimension = {
    x: number;
    y: number;
    fields: {
        key: DraftDimensionField;
        label: string;
        value: number;
        unit: 'length' | 'angle';
    }[];
    polygon?: { sides: number; mode: 'inscribed' | 'circumscribed' };
};

interface CanvasHudProps {
    loopCount: number;
    darkMode: boolean;
    cursorRef: RefObject<Point | null>;
    guidePlacement: 'edge' | null;
    guideDraft: GuideDraft | null;
    camera: Camera;
    onGuideOffsetChange(offset: number): void;
    onCancelGuide(): void;
    units: UnitSystem;
    draftProgress: { percent: number; label: string } | null | undefined;
    progressPosition: Point | null;
    draftDimension: DraftDimension | null;
    onDraftDimensionChange(key: DraftDimensionField, value: number): void;
    onDraftDimensionCommit(): void;
    onDraftDimensionCancel(): void;
    onPolygonSidesChange(sides: number): void;
    onPolygonModeChange(mode: 'inscribed' | 'circumscribed'): void;
    jobExceedsStock: boolean;
    onAdjustStock?: () => void;
    onZoom(factor: number): void;
    onFit(): void;
}

/** DOM overlays for the canvas: status, coordinates, progress and viewport controls. */
export function CanvasHud({
    loopCount,
    darkMode,
    cursorRef,
    guidePlacement,
    guideDraft,
    camera,
    onGuideOffsetChange,
    onCancelGuide,
    units,
    draftProgress,
    progressPosition,
    draftDimension,
    onDraftDimensionChange,
    onDraftDimensionCommit,
    onDraftDimensionCancel,
    onPolygonSidesChange,
    onPolygonModeChange,
    jobExceedsStock,
    onAdjustStock,
    onZoom,
    onFit,
}: CanvasHudProps) {
    const chip = darkMode
        ? 'bg-dark/80 border-robin-900 text-slate-300'
        : 'bg-white/90 border-slate-300 text-slate-600';
    const progress = Number.isFinite(draftProgress?.percent)
        ? (draftProgress?.percent ?? 0)
        : 0;
    return (
        <>
            <div
                className={`absolute top-2 left-2 text-xs px-2 py-1 rounded border ${chip}`}
            >
                {loopCount
                    ? `${loopCount} shape${loopCount === 1 ? '' : 's'}`
                    : 'Drop DXF/SVG, STL/OBJ, or an image here — or use File > Import File'}
            </div>
            <CursorReadout
                cursorRef={cursorRef}
                darkMode={darkMode}
                guidePlacement={guidePlacement}
                guideDraft={guideDraft}
                units={units}
            />
            {guideDraft && (
                <GuideOffsetInput
                    draft={guideDraft}
                    camera={camera}
                    darkMode={darkMode}
                    units={units}
                    onChange={onGuideOffsetChange}
                    onCancel={onCancelGuide}
                />
            )}
            {jobExceedsStock && (
                <div
                    role="alert"
                    className="absolute top-11 left-2 flex items-center gap-2 rounded border border-amber-500/70 bg-amber-100/95 px-2 py-1 text-xs font-medium text-amber-950 shadow dark:bg-amber-950/90 dark:text-amber-100"
                >
                    <span>Job geometry exceeds the configured stock.</span>
                    {onAdjustStock && (
                        <button
                            type="button"
                            onClick={onAdjustStock}
                            className="rounded border border-amber-700/50 bg-white/70 px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-white dark:border-amber-300/50 dark:bg-amber-900/50 dark:hover:bg-amber-900"
                        >
                            Edit job stock
                        </button>
                    )}
                </div>
            )}
            {draftProgress &&
                createPortal(
                    <div
                        role="status"
                        className={`pointer-events-none fixed z-[100] flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border shadow-lg ${chip}`}
                        style={
                            progressPosition
                                ? {
                                      left: progressPosition.x,
                                      top: progressPosition.y,
                                  }
                                : { left: '50%', top: 12 }
                        }
                    >
                        <span className="whitespace-nowrap">
                            {draftProgress.label}
                        </span>
                        <span className="tabular-nums font-medium">
                            {Math.round(progress)}%
                        </span>
                        <span
                            aria-hidden="true"
                            className="w-16 h-1.5 rounded-full bg-slate-500/30 overflow-hidden"
                        >
                            <span
                                className="block h-full rounded-full bg-robin-500"
                                style={{
                                    width: `${Math.min(100, Math.max(0, progress))}%`,
                                }}
                            />
                        </span>
                    </div>,
                    document.body,
                )}
            {draftDimension && (
                <div
                    aria-label="Shape dimensions"
                    className={`absolute z-20 flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] shadow ${darkMode ? 'border-orange-400 bg-dark text-slate-100' : 'border-orange-500 bg-white text-slate-700'}`}
                    style={{
                        left: draftDimension.x,
                        top: draftDimension.y,
                    }}
                >
                    {draftDimension.fields.map((field) => (
                        <label
                            key={field.key}
                            className="flex items-center gap-1 whitespace-nowrap"
                        >
                            <span>{field.label}</span>
                            <input
                                aria-label={`Shape ${field.label.toLowerCase()}`}
                                type="number"
                                step={field.unit === 'angle' ? '0.1' : '0.01'}
                                value={Number(
                                    field.value.toFixed(
                                        field.unit === 'angle' ? 1 : 2,
                                    ),
                                )}
                                onChange={(event) => {
                                    const numeric = Number(
                                        event.currentTarget.value,
                                    );
                                    if (Number.isFinite(numeric))
                                        onDraftDimensionChange(
                                            field.key,
                                            numeric,
                                        );
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        onDraftDimensionCommit();
                                    } else if (event.key === 'Escape') {
                                        event.preventDefault();
                                        onDraftDimensionCancel();
                                    }
                                }}
                                className={`w-16 appearance-none border-0 bg-transparent text-right tabular-nums outline-none ${darkMode ? 'text-white' : 'text-slate-900'}`}
                            />
                            <span>
                                {field.unit === 'angle'
                                    ? 'deg'
                                    : lengthUnit(units)}
                            </span>
                        </label>
                    ))}
                    {draftDimension.polygon && (
                        <>
                            <div className="mx-0.5 h-5 border-l border-slate-300 dark:border-slate-600" />
                            {(['inscribed', 'circumscribed'] as const).map(
                                (mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        aria-pressed={
                                            draftDimension.polygon?.mode ===
                                            mode
                                        }
                                        onClick={() =>
                                            onPolygonModeChange(mode)
                                        }
                                        className={`rounded px-1.5 py-1 text-[10px] capitalize ${draftDimension.polygon?.mode === mode ? 'bg-blue-100 font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                                    >
                                        {mode}
                                    </button>
                                ),
                            )}
                            <label className="ml-1 flex items-center gap-1 whitespace-nowrap">
                                <span>Sides</span>
                                <input
                                    aria-label="Polygon sides"
                                    type="number"
                                    min={3}
                                    max={128}
                                    step={1}
                                    value={draftDimension.polygon.sides}
                                    onChange={(event) => {
                                        const sides = Number(
                                            event.currentTarget.value,
                                        );
                                        if (Number.isFinite(sides) && sides > 0)
                                            onPolygonSidesChange(
                                                Math.min(
                                                    128,
                                                    Math.round(sides),
                                                ),
                                            );
                                    }}
                                    onBlur={(event) => {
                                        const sides = Number(
                                            event.currentTarget.value,
                                        );
                                        if (Number.isFinite(sides))
                                            onPolygonSidesChange(
                                                Math.min(
                                                    128,
                                                    Math.max(
                                                        3,
                                                        Math.round(sides),
                                                    ),
                                                ),
                                            );
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            onDraftDimensionCommit();
                                        } else if (event.key === 'Escape') {
                                            event.preventDefault();
                                            onDraftDimensionCancel();
                                        }
                                    }}
                                    className={`w-10 border-0 bg-transparent text-right tabular-nums outline-none ${darkMode ? 'text-white' : 'text-slate-900'}`}
                                />
                                <span>#</span>
                            </label>
                        </>
                    )}
                </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-1">
                <ZoomButton
                    label="+"
                    onClick={() => onZoom(1.25)}
                    darkMode={darkMode}
                />
                <ZoomButton
                    label="-"
                    onClick={() => onZoom(0.8)}
                    darkMode={darkMode}
                />
                <ZoomButton label="Fit" onClick={onFit} darkMode={darkMode} />
            </div>
        </>
    );
}

function CursorReadout({
    cursorRef,
    darkMode,
    guidePlacement,
    guideDraft,
    units,
}: {
    cursorRef: RefObject<Point | null>;
    darkMode: boolean;
    guidePlacement: 'edge' | null;
    guideDraft: GuideDraft | null;
    units: UnitSystem;
}) {
    const cursor = cursorRef.current;
    if (!cursor) return null;
    return (
        <div
            className={`absolute bottom-2 left-2 text-xs [@media(pointer:coarse)]:hidden [@media(max-width:767px)]:hidden px-2 py-1 rounded border tabular-nums ${darkMode ? 'bg-dark/80 border-robin-900 text-slate-300' : 'bg-white/90 border-slate-300 text-slate-600'}`}
        >
            {guidePlacement
                ? guideDraft
                    ? `Guide from ${guideDraft.sourceLabel} · Offset ${displayValue(guideDraft.offset, units, 2)} ${lengthUnit(units)}`
                    : 'Guide: hover an edge or axis, then click'
                : `X ${displayValue(cursor.x, units, 2)} · Y ${displayValue(cursor.y, units, 2)} ${lengthUnit(units)}`}
        </div>
    );
}

function GuideOffsetInput({
    draft,
    camera,
    darkMode,
    units,
    onChange,
    onCancel,
}: {
    draft: GuideDraft;
    camera: Camera;
    darkMode: boolean;
    units: UnitSystem;
    onChange(offset: number): void;
    onCancel(): void;
}) {
    const cursor = draft.cursor ?? draft.source;
    const left = camera.tx + cursor.x * camera.scale + 14;
    const top = camera.ty - cursor.y * camera.scale + 14;
    const value =
        units === 'imperial' ? draft.offset / MM_PER_INCH : draft.offset;
    return (
        <label
            className={`absolute z-20 flex w-40 items-center gap-1 rounded border px-1.5 py-1 text-xs shadow ${darkMode ? 'border-orange-400 bg-dark text-slate-100' : 'border-orange-500 bg-white text-slate-700'}`}
            style={{
                left: `clamp(8px, ${left}px, calc(100% - 168px))`,
                top: `clamp(8px, ${top}px, calc(100% - 40px))`,
            }}
        >
            <span>Offset</span>
            <input
                aria-label="Guide offset distance"
                type="number"
                step="any"
                value={Number(value.toFixed(3))}
                onChange={(event) => {
                    const numeric = Number(event.currentTarget.value);
                    if (Number.isFinite(numeric))
                        onChange(
                            numeric * (units === 'imperial' ? MM_PER_INCH : 1),
                        );
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        // Keep the guide as a live preview; the next canvas
                        // click is the single, predictable placement action.
                        event.preventDefault();
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancel();
                    }
                }}
                className={`w-16 border-0 bg-transparent text-right tabular-nums outline-none ${darkMode ? 'text-white' : 'text-slate-900'}`}
            />
            <span>{lengthUnit(units)}</span>
        </label>
    );
}

function ZoomButton({
    label,
    onClick,
    darkMode,
}: {
    label: string;
    onClick(): void;
    darkMode: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-8 h-8 rounded border text-sm ${darkMode ? 'bg-dark/80 border-robin-900 text-slate-200 hover:bg-dark-lighter' : 'bg-white/90 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
        >
            {label}
        </button>
    );
}
