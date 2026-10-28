/**
 * Purpose: Implementation module for CadInspector in the components domain.
 */
import { useEffect, useState } from 'react';
import { FloatingPanel } from './floating/FloatingPanel';
import cx from 'classnames';
import type { ViewLoop } from '../canvas/types';
import { FontPicker } from '../draw/FontPicker';
import { FONT_OPTIONS } from '../draw/textGeometry';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { objectLayerId, type DrawingLayer } from '../layers/model';
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
    layers,
    onLayerChange,
    angle,
    onApply,
    onPreview,
    onClose,
    units,
}: {
    loop: ViewLoop;
    layers?: DrawingLayer[];
    onLayerChange?: (layerId: string) => void;
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
    const selectedFont = FONT_OPTIONS.find((font) => font.id === fontId);
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
        <FloatingPanel
            placement="right"
            title="Shape"
            label="Selected shape properties"
            onClose={onClose}
            closeLabel="Close shape properties"
            className="w-[calc(100%-1rem)] sm:w-72 lg:w-56 max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)]"
        >
            <div className="p-3 grid grid-cols-2 gap-2">
                {layers && onLayerChange && (
                    <label className="col-span-2 space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Layer
                        </span>
                        <select
                            aria-label="Shape layer"
                            value={objectLayerId(loop)}
                            onChange={(event) =>
                                onLayerChange(event.target.value)
                            }
                            className={numCls}
                        >
                            {layers.map((layer) => (
                                <option key={layer.id} value={layer.id}>
                                    {layer.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
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
                                style={{
                                    fontFamily:
                                        selectedFont?.kind === 'outline'
                                            ? `"${selectedFont.family}", sans-serif`
                                            : undefined,
                                }}
                                onChange={(e) => {
                                    setDirty(true);
                                    setText(e.target.value);
                                }}
                                className={numCls}
                            />
                        </label>
                        <div className="space-y-1 col-span-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Font
                            </span>
                            <FontPicker
                                value={fontId}
                                onChange={(value) => {
                                    setDirty(true);
                                    setFontId(value);
                                }}
                                className={numCls}
                            />
                        </div>
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
        </FloatingPanel>
    );
}
