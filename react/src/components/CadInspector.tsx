/**
 * Purpose: Implementation module for CadInspector in the components domain.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import cx from 'classnames';
import type { ViewLoop } from '../canvas/types';
import { FONT_OPTIONS } from '../draw/textGeometry';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { UnitInput } from './UnitInput';

export interface InspectorPatch {
    x: number;
    y: number;
    w: number;
    h: number;
    angle: number;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
    text?: string;
    fontId?: string;
    fontSize?: number;
}

/**
 * Floating shape-properties panel (camcanvas CAD inspector): absolute
 * X/Y position, Width × Height and angle for the single selected vector.
 */
export function CadInspector({
    loop,
    angle,
    onApply,
    onPreview,
    onClose,
    units,
}: {
    loop: ViewLoop;
    angle: number;
    onApply: (patch: InspectorPatch) => void;
    onPreview?: (patch: InspectorPatch | null) => void;
    onClose: () => void;
    units: UnitSystem;
}) {
    const xs = loop.points.map((p) => p.x);
    const ys = loop.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const [x, setX] = useState(minX);
    const [y, setY] = useState(minY);
    const [width, setWidth] = useState(w);
    const [height, setHeight] = useState(h);
    const [deg, setDeg] = useState(angle);
    const isCircle =
        loop.sourceType === 'circle' || loop.exportGeometry?.type === 'circle';
    const isPolygon = loop.sourceType === 'polygon';
    const isText = loop.sourceType === 'text';
    const [radius, setRadius] = useState(loop.radius ?? Math.min(w, h) / 2);
    const [sides, setSides] = useState(loop.sides ?? 6);
    const [polygonMode, setPolygonMode] = useState(
        loop.polygonMode ?? 'inscribed',
    );
    const [text, setText] = useState(loop.text ?? 'TEXT');
    const [fontId, setFontId] = useState(loop.fontId ?? 'single-line');
    const [fontSize, setFontSize] = useState(loop.fontSize ?? h);
    const [dirty, setDirty] = useState(false);
    const currentPatch = (): InspectorPatch => ({
        x,
        y,
        w: width,
        h: height,
        angle: deg,
        radius,
        sides,
        polygonMode,
        text,
        fontId,
        fontSize,
    });

    useEffect(() => {
        if (!dirty) {
            onPreview?.(null);
            return;
        }
        onPreview?.(currentPatch());
        return () => onPreview?.(null);
    }, [
        x,
        y,
        width,
        height,
        deg,
        radius,
        sides,
        polygonMode,
        text,
        fontId,
        fontSize,
        dirty,
    ]);

    const numCls =
        'w-full rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm';

    return (
        <aside
            aria-label="Selected shape properties"
            className="absolute top-2 right-2 z-20 w-[calc(100%-1rem)] sm:w-72 lg:w-56 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)] overflow-y-auto rounded-xl border border-slate-200 dark:border-robin-900 bg-white/95 dark:bg-dark/95 shadow-xl"
        >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white dark:bg-dark px-3 py-2 border-b border-slate-200 dark:border-robin-900">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                    Shape
                </span>
                <button
                    onClick={onClose}
                    aria-label="Close shape properties"
                    className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                    <X size={16} />
                </button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        X ({lengthUnit(units)})
                    </span>
                    <UnitInput
                        units={units}
                        stepMm={0.1}
                        valueMm={x}
                        onChangeMm={(value) => {
                            setDirty(true);
                            setX(value);
                        }}
                        className={numCls}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Y ({lengthUnit(units)})
                    </span>
                    <UnitInput
                        units={units}
                        stepMm={0.1}
                        valueMm={y}
                        onChangeMm={(value) => {
                            setDirty(true);
                            setY(value);
                        }}
                        className={numCls}
                    />
                </label>
                {!isPolygon && (
                    <>
                        <label className="space-y-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Width ({lengthUnit(units)})
                            </span>
                            <UnitInput
                                units={units}
                                stepMm={0.1}
                                minMm={0.01}
                                valueMm={width}
                                onChangeMm={(value) => {
                                    setDirty(true);
                                    setWidth(value);
                                }}
                                className={numCls}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Height ({lengthUnit(units)})
                            </span>
                            <UnitInput
                                units={units}
                                stepMm={0.1}
                                minMm={0.01}
                                valueMm={height}
                                onChangeMm={(value) => {
                                    setDirty(true);
                                    setHeight(value);
                                }}
                                className={numCls}
                            />
                        </label>
                    </>
                )}
                <label className="space-y-1 col-span-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Angle (°)
                    </span>
                    <input
                        type="number"
                        step={0.1}
                        value={deg}
                        onChange={(e) => {
                            setDirty(true);
                            setDeg(Number(e.target.value));
                        }}
                        className={numCls}
                    />
                </label>
                {(isCircle || isPolygon) && (
                    <label className="space-y-1 col-span-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Radius ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0.01}
                            valueMm={radius}
                            onChangeMm={(value) => {
                                setDirty(true);
                                setRadius(value);
                            }}
                            className={numCls}
                        />
                    </label>
                )}
                {isPolygon && (
                    <label className="space-y-1 col-span-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Polygon sides
                        </span>
                        <input
                            type="number"
                            step={1}
                            min={3}
                            max={128}
                            value={sides}
                            onChange={(e) => {
                                setDirty(true);
                                setSides(Number(e.target.value));
                            }}
                            className={numCls}
                        />
                        <select
                            value={polygonMode}
                            onChange={(e) => {
                                setDirty(true);
                                setPolygonMode(
                                    e.target.value as
                                        | 'inscribed'
                                        | 'circumscribed',
                                );
                            }}
                            className={numCls}
                        >
                            <option value="inscribed">Inscribed</option>
                            <option value="circumscribed">Circumscribed</option>
                        </select>
                    </label>
                )}
                {isText && (
                    <>
                        <label className="space-y-1 col-span-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Text
                            </span>
                            <input
                                value={text}
                                onChange={(e) => {
                                    setDirty(true);
                                    setText(e.target.value);
                                }}
                                className={numCls}
                            />
                        </label>
                        <label className="space-y-1 col-span-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Font
                            </span>
                            <select
                                value={fontId}
                                onChange={(e) => {
                                    setDirty(true);
                                    setFontId(e.target.value);
                                }}
                                className={numCls}
                            >
                                {FONT_OPTIONS.map((font) => (
                                    <option key={font.id} value={font.id}>
                                        {font.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1 col-span-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Font size ({lengthUnit(units)})
                            </span>
                            <UnitInput
                                units={units}
                                minMm={1}
                                stepMm={0.1}
                                valueMm={fontSize}
                                onChangeMm={(value) => {
                                    setDirty(true);
                                    setFontSize(value);
                                }}
                                className={numCls}
                            />
                        </label>
                    </>
                )}
                <button
                    onClick={() => onApply(currentPatch())}
                    className={cx(
                        'col-span-2 rounded-lg bg-robin-500 hover:bg-robin-600 text-white',
                        'px-3 py-2 text-sm font-medium touch-manipulation',
                    )}
                >
                    Apply
                </button>
            </div>
        </aside>
    );
}
