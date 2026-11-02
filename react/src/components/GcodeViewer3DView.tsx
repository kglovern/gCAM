import type { TimedPreview } from '../engine/prepare-timed-preview';
import { Maximize2, Play, Pause, RotateCcw } from 'lucide-react';
import { usePreviewPlayback } from './usePreviewPlayback';
import type { LaserRotarySetup } from '../cam/laser-rotary.js';
/**
 * Purpose: G-code preview powered by the shared gviewer parser and renderer.
 */
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
} from 'react';
import { GCodeVisualizer } from '@sienci/gviewer/react';
import type { WorkerSegmentsData } from '@sienci/gviewer';
import { createGcodePreviewWorker } from './gcodePreviewWorker';
import {
    gCodeViewerThemePresets,
    type GCodeViewerBounds,
    type GCodeViewerHandle,
} from '@sienci/gviewer/viewer';

function gridForBounds(bounds: GCodeViewerBounds) {
    const width = Math.max(1, bounds.max.x - bounds.min.x);
    const height = Math.max(1, bounds.max.y - bounds.min.y);
    const padding = Math.max(25, width * 0.1, height * 0.1);
    return {
        sizeX: width + padding * 2,
        sizeY: height + padding * 2,
        axisDepth: Math.max(50, bounds.max.z - bounds.min.z + padding),
        labels: true,
        bounds: {
            min: { x: bounds.min.x - padding, y: bounds.min.y - padding },
            max: { x: bounds.max.x + padding, y: bounds.max.y + padding },
        },
    };
}

async function fitPreview(viewer: GCodeViewerHandle) {
    viewer.resize();
    viewer.focusToModel();
    // The viewer applies camera focus in its animation loop, not inside focusToModel().
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
}

/**
 * Render exported G-code with the same parser used by gviewer.
 */
export function GcodeViewer3DView({
    gcode,
    darkMode,
    laser,
    laserMax,
    laserRotary,
    timedPreview,
}: {
    gcode: string;
    darkMode: boolean;
    laser?: boolean;
    laserMax?: number;
    laserRotary?: LaserRotarySetup;
    timedPreview?: TimedPreview;
}) {
    const viewerRef = useRef<GCodeViewerHandle>(null);
    const requestRef = useRef(0);
    const playback = usePreviewPlayback(viewerRef, timedPreview?.plan);
    const { load: loadPlayback, clear: clearPlayback } = playback;
    const [ready, setReady] = useState(false);
    const [status, setStatus] = useState('Add a toolpath to preview G-code.');

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const request = ++requestRef.current;
        clearPlayback();
        setReady(false);
        if (!gcode.trim()) {
            viewer.unload();
            setStatus('Add a toolpath to preview G-code.');
            return;
        }
        setStatus('Preparing G-code preview…');
        let active = true;
        let worker: Worker | undefined;
        const fail = () => {
            if (!active || request !== requestRef.current) return;
            worker?.terminate();
            viewer.unload();
            setReady(false);
            setStatus('Unable to render this G-code.');
        };
        try {
            const receive = async (
                event: MessageEvent<
                    | { progress: number }
                    | { data: WorkerSegmentsData }
                    | { error: string }
                >,
            ) => {
                if (!active || request !== requestRef.current) return;
                if ('progress' in event.data) {
                    setStatus(
                        `Preparing G-code preview… ${event.data.progress}%`,
                    );
                    return;
                }
                if ('error' in event.data) return fail();
                worker?.terminate();
                try {
                    viewer.setOptions({
                        mode: {
                            laser: Boolean(event.data.data.isLaser),
                            sim3d: false,
                        },
                        bit: {
                            ...viewer.getOptions().bit,
                            type: event.data.data.isLaser
                                ? 'crosshair'
                                : 'drill',
                            colorSource: event.data.data.isLaser
                                ? 'custom'
                                : 'cutting',
                            color: event.data.data.isLaser
                                ? '#f59e0b'
                                : viewer.getOptions().bit.color,
                        },
                    });
                    await viewer.loadFromSegments(event.data.data);
                    if (!active || request !== requestRef.current) return;
                    if (!loadPlayback(event.data.data)) {
                        viewer.unload();
                        setStatus('No motion to preview.');
                        return;
                    }
                    const bounds = viewer.getBounds();
                    if (bounds)
                        viewer.setOptions({ grid: gridForBounds(bounds) });
                    await fitPreview(viewer);
                    if (!active || request !== requestRef.current) return;
                    setReady(true);
                    setStatus(
                        'Drag to orbit · scroll to zoom · right-drag to pan',
                    );
                } catch {
                    fail();
                }
            };
            if (timedPreview) {
                void receive({
                    data: { data: timedPreview.geometry },
                } as MessageEvent<{ data: WorkerSegmentsData }>);
            } else {
                worker = createGcodePreviewWorker();
                worker.onerror = fail;
                worker.onmessage = receive;
                worker.postMessage({ gcode, laser, laserMax, laserRotary });
            }
        } catch {
            fail();
        }
        return () => {
            active = false;
            worker?.terminate();
        };
    }, [
        gcode,
        laser,
        laserMax,
        laserRotary,
        timedPreview,
        loadPlayback,
        clearPlayback,
    ]);

    const options = useMemo<
        NonNullable<ComponentProps<typeof GCodeVisualizer>['options']>
    >(
        () => ({
            units: 'mm',
            boundingBox: { visible: true, labels: true },
            camera: {
                projection: 'perspective',
                fov: 45,
                focusDurationMs: 0,
                orbit: { enableDamping: false },
                initialPosition: { x: 0, y: -500, z: 500 },
            },
            render: {
                antialias: true,
                theme: darkMode
                    ? gCodeViewerThemePresets['tokyo-night']
                    : gCodeViewerThemePresets.light,
            },
        }),
        [darkMode],
    );
    const callbacks = useMemo<
        NonNullable<ComponentProps<typeof GCodeVisualizer>['callbacks']>
    >(
        () => ({
            onProgress: (event) => {
                if (event.state === 'determinate')
                    setStatus(
                        `${event.label} ${event.processed}/${event.total}`,
                    );
                else if (event.state === 'indeterminate')
                    setStatus(event.label);
            },
        }),
        [],
    );

    return (
        <div
            role="region"
            aria-label="G-code preview"
            className={`gcam-gcode-preview relative h-full flex flex-col rounded border overflow-hidden ${
                darkMode
                    ? 'border-robin-900 bg-[#0b1220]'
                    : 'border-slate-300 bg-white'
            }`}
        >
            {gcode.trim() && (
                <div
                    role="group"
                    aria-label="Preview playback"
                    className="gcode-playback flex flex-wrap items-center gap-2 border-b px-2 py-1 text-xs"
                >
                    <button
                        type="button"
                        aria-label={
                            playback.playing ? 'Pause preview' : 'Play preview'
                        }
                        disabled={
                            !playback.playing && (!ready || !playback.total)
                        }
                        onClick={
                            playback.playing ? playback.pause : playback.play
                        }
                        className="flex min-h-8 items-center gap-1 rounded border border-slate-300 px-2 disabled:opacity-40 dark:border-robin-900"
                    >
                        {playback.playing ? (
                            <Pause size={14} />
                        ) : (
                            <Play size={14} />
                        )}
                        {playback.playing ? 'Pause' : 'Play'}
                    </button>
                    <button
                        type="button"
                        aria-label="Reset preview"
                        disabled={!ready || !playback.total}
                        onClick={playback.reset}
                        className="flex min-h-8 items-center gap-1 rounded border border-slate-300 px-2 disabled:opacity-40 dark:border-robin-900"
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                    <input
                        type="range"
                        aria-label={
                            playback.timed ? 'Preview time' : 'Preview position'
                        }
                        aria-valuetext={
                            playback.timed
                                ? playback.position.toFixed(1) +
                                  ' of ' +
                                  playback.duration.toFixed(1) +
                                  ' estimated seconds'
                                : playback.line +
                                  ' of ' +
                                  playback.total +
                                  ' program lines'
                        }
                        min={0}
                        max={playback.duration}
                        step={playback.timed ? 'any' : 1}
                        value={playback.position}
                        disabled={!ready || !playback.total}
                        onChange={(event) =>
                            playback.seek(event.currentTarget.valueAsNumber)
                        }
                        className="min-w-24 flex-1"
                    />
                    {playback.timed && (
                        <output
                            aria-label="Estimated playback time"
                            className="tabular-nums"
                        >
                            {playback.position.toFixed(1)} /{' '}
                            {playback.duration.toFixed(1)} s estimated
                        </output>
                    )}
                    <output aria-label="Preview program line">
                        Line {playback.line}/{playback.total}
                    </output>
                    <label className="flex items-center gap-1">
                        <select
                            aria-label={
                                playback.timed
                                    ? 'Preview speed multiplier'
                                    : 'Preview speed (lines per second)'
                            }
                            value={playback.speed}
                            disabled={!ready}
                            onChange={(event) =>
                                playback.setSpeed(
                                    Number(event.currentTarget.value),
                                )
                            }
                            className="rounded border border-slate-300 bg-transparent p-1 dark:border-robin-900"
                        >
                            {(playback.timed
                                ? [0.25, 0.5, 1, 2, 5, 10, 50]
                                : [25, 100, 500, 2000, 10000]
                            ).map((speed) => (
                                <option key={speed} value={speed}>
                                    {speed.toLocaleString()}
                                    {playback.timed ? '×' : ''}
                                </option>
                            ))}
                        </select>
                        {playback.timed ? '' : 'lines/s'}
                    </label>
                </div>
            )}
            <div className="flex-1 min-h-0">
                <GCodeVisualizer
                    id="gcam-gcode-viewer"
                    ref={viewerRef}
                    className="h-full w-full"
                    options={options}
                    callbacks={callbacks}
                />
            </div>
            <div
                className={`flex items-center justify-between gap-2 px-2 py-1 text-xs border-t ${
                    darkMode
                        ? 'text-slate-400 border-robin-900'
                        : 'text-slate-500 border-slate-200'
                }`}
            >
                <span role="status">{status}</span>
                <button
                    type="button"
                    disabled={!ready}
                    className="gcode-fit flex min-h-8 shrink-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-700"
                    onClick={async () => {
                        const viewer = viewerRef.current;
                        if (!viewer) return;
                        const request = requestRef.current;
                        setReady(false);
                        try {
                            await fitPreview(viewer);
                            if (request === requestRef.current) setReady(true);
                        } catch {
                            if (request === requestRef.current)
                                setStatus('Unable to fit this preview.');
                        }
                    }}
                >
                    <Maximize2 size={13} />
                    Fit view
                </button>
            </div>
        </div>
    );
}
