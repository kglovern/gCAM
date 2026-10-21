/**
 * Purpose: Implementation module for CutPreview3DView in the components domain.
 */
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
    MeshStockSimulator,
    type PreviewMemoryStats,
} from '../engine/mesh-stock-simulator';
import type { JobStock } from '../job/stock';

interface PreviewInstance {
    build(toolpaths: Record<string, unknown>[], stock: JobStock): void;
    setGcodeOverlay(gcode: string): void;
    setGcodeVisible(visible: boolean): void;
    setStockVisible(visible: boolean): void;
    resize(): void;
    setTheme(dark: boolean): void;
    setPlaybackSpeed(speed: number): void;
    togglePlayback(): void;
    resetPlayback(opts?: { render?: boolean }): void;
    replay(): void;
    resetCamera(top?: boolean): void;
    dispose(): void;
    getMemoryStats(): PreviewMemoryStats;
    onPlaybackChange?:
        | ((playback: { running?: boolean; speed?: number }) => void)
        | null;
    onStockFitChange?: ((state: { exceeds: boolean }) => void) | null;
}

export interface PreviewControls {
    empty: boolean;
    running: boolean;
    simulate: () => void;
    iso: () => void;
    top: () => void;
}

function formatMemory(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 3D stock-removal preview (ported engine). Builds from the toolpath stack;
 * playback state mirrors back for the controls.
 */
export function CutPreview3DView({
    toolpaths,
    darkMode,
    stock,
    gcode,
    onControlsChange,
}: {
    toolpaths: Record<string, unknown>[];
    darkMode: boolean;
    stock: JobStock;
    gcode: string;
    onControlsChange?: (controls: PreviewControls | null) => void;
}) {
    const touch = useMediaQuery('(pointer: coarse)');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<PreviewInstance | null>(null);
    const [running, setRunning] = useState(false);
    const [empty, setEmpty] = useState(toolpaths.length === 0);
    const [showStock, setShowStock] = useState(true);
    const [showGcode, setShowGcode] = useState(true);
    const [toolpathExceedsStock, setToolpathExceedsStock] = useState(false);
    const [memory, setMemory] = useState<PreviewMemoryStats>({
        cpuBytes: 0,
        gpuBytes: 0,
        jsHeapBytes: null,
        gridCells: 0,
    });
    const buildTimer = useRef<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const status = statusRef.current;
        if (!canvas || !status) return;
        const instance = new MeshStockSimulator(
            canvas,
            status,
        ) as unknown as PreviewInstance;
        instance.onPlaybackChange = (playback: {
            running?: boolean;
            speed?: number;
        }) => {
            setRunning(Boolean(playback?.running));
        };
        instance.onStockFitChange = ({ exceeds }) =>
            setToolpathExceedsStock(exceeds);
        instanceRef.current = instance;
        instance.setTheme(darkMode);
        const ro = new ResizeObserver(() => instance.resize());
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => {
            ro.disconnect();
            instance.dispose();
            instanceRef.current = null;
        };
    }, []);

    useEffect(() => {
        instanceRef.current?.setTheme(darkMode);
    }, [darkMode]);

    useEffect(() => {
        setEmpty(toolpaths.length === 0);
        setToolpathExceedsStock(false);
        if (buildTimer.current) window.clearTimeout(buildTimer.current);
        buildTimer.current = window.setTimeout(() => {
            instanceRef.current?.build(toolpaths, stock);
        }, 150);
        return () => {
            if (buildTimer.current) window.clearTimeout(buildTimer.current);
        };
    }, [stock, toolpaths]);

    useEffect(() => {
        instanceRef.current?.setGcodeOverlay(gcode);
    }, [gcode]);

    useEffect(() => {
        instanceRef.current?.setStockVisible(showStock);
    }, [showStock]);

    useEffect(() => {
        instanceRef.current?.setGcodeVisible(showGcode);
    }, [showGcode]);

    useEffect(() => {
        const update = () => {
            const current = instanceRef.current?.getMemoryStats();
            if (current) setMemory(current);
        };
        update();
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Refs mirror the latest callback/props so the controls effect below
    // only depends on primitives. Depending on object/array props here caused
    // an infinite render loop: notify parent → parent re-renders with fresh
    // prop identity → effect re-runs → notify again (main thread saturation).
    const controlsCallbackRef = useRef(onControlsChange);
    controlsCallbackRef.current = onControlsChange;

    useEffect(() => {
        controlsCallbackRef.current?.({
            empty,
            running,
            simulate: () => {
                const instance = instanceRef.current;
                if (!instance) return;
                if (running) {
                    instance.togglePlayback();
                    return;
                }
                instance.resetPlayback();
                instance.setPlaybackSpeed(100);
                instance.togglePlayback();
            },
            iso: () => instanceRef.current?.resetCamera(false),
            top: () => instanceRef.current?.resetCamera(true),
        });
    }, [empty, running]);

    useEffect(() => () => controlsCallbackRef.current?.(null), []);

    return (
        <div
            className={`relative h-full flex flex-col rounded border overflow-hidden ${
                darkMode
                    ? 'border-robin-900 bg-[#0b1220]'
                    : 'border-slate-300 bg-white'
            }`}
        >
            <div className="flex-1 min-h-0">
                <canvas
                    ref={canvasRef}
                    className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
                    aria-label={
                        touch
                            ? '3D stock simulation. One finger orbits; two fingers pan and pinch to zoom.'
                            : '3D stock simulation. Drag to orbit, scroll to zoom, right-drag to pan.'
                    }
                />
            </div>
            <div className="absolute top-2 right-2 flex gap-1 rounded border border-slate-300 bg-white/90 p-1 text-xs shadow dark:border-robin-800 dark:bg-dark/90">
                <label className="flex cursor-pointer items-center gap-1 px-1 text-slate-700 dark:text-slate-200">
                    <input
                        type="checkbox"
                        checked={showStock}
                        onChange={(event) => setShowStock(event.target.checked)}
                    />
                    Stock
                </label>
                <label className="flex cursor-pointer items-center gap-1 px-1 text-slate-700 dark:text-slate-200">
                    <input
                        type="checkbox"
                        checked={showGcode}
                        onChange={(event) => setShowGcode(event.target.checked)}
                    />
                    G-code
                </label>
            </div>
            <div
                className="absolute top-2 left-2 rounded border border-slate-300 bg-white/90 px-2 py-1 text-xs text-slate-700 shadow dark:border-robin-800 dark:bg-dark/90 dark:text-slate-200"
                aria-label="3D preview memory usage"
                title={`Preview buffers: CPU ${formatMemory(memory.cpuBytes)}; estimated GPU ${formatMemory(memory.gpuBytes)}. ${memory.gridCells.toLocaleString()} height cells. Browser JavaScript heap: ${memory.jsHeapBytes === null ? 'not exposed by this browser' : formatMemory(memory.jsHeapBytes)}.`}
            >
                Preview ~{formatMemory(memory.cpuBytes + memory.gpuBytes)}
                <span className="ml-1 text-slate-500 dark:text-slate-400">
                    (CPU {formatMemory(memory.cpuBytes)} + GPU ~
                    {formatMemory(memory.gpuBytes)})
                    {memory.jsHeapBytes !== null &&
                        ` · heap ${formatMemory(memory.jsHeapBytes)}`}
                </span>
            </div>
            {toolpathExceedsStock && (
                <div className="absolute top-12 right-2 max-w-72 rounded border border-amber-400 bg-amber-50/95 px-2 py-1 text-xs text-amber-900 shadow dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-200">
                    Toolpath exceeds the {stock.widthMm} × {stock.heightMm} mm
                    job stock. Only the overlapping stock area is simulated.
                    {showGcode
                        ? ' G-code remains at its programmed position.'
                        : ''}
                </div>
            )}
            <div
                ref={statusRef}
                className={`px-2 py-1 text-xs border-t ${
                    darkMode
                        ? 'text-slate-400 border-robin-900'
                        : 'text-slate-500 border-slate-200'
                }`}
            >
                {touch
                    ? 'One finger: orbit · Two fingers: pan / pinch to zoom'
                    : 'Drag to orbit · scroll to zoom · right-drag to pan'}
            </div>
        </div>
    );
}
