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

/**
 * Render exported G-code with the same parser used by gviewer.
 */
export function GcodeViewer3DView({
    gcode,
    darkMode,
}: {
    gcode: string;
    darkMode: boolean;
}) {
    const viewerRef = useRef<GCodeViewerHandle>(null);
    const requestRef = useRef(0);
    const [status, setStatus] = useState('Add a toolpath to preview G-code.');

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const request = ++requestRef.current;
        if (!gcode.trim()) {
            viewer.unload();
            setStatus('Add a toolpath to preview G-code.');
            return;
        }
        setStatus('Preparing G-code preview…');
        void viewer
            .loadFromText(gcode)
            .then(() => {
                if (request !== requestRef.current) return;
                const bounds = viewer.getBounds();
                if (bounds) viewer.setOptions({ grid: gridForBounds(bounds) });
                viewer.focusToModel();
                setStatus('Drag to orbit · scroll to zoom · right-drag to pan');
            })
            .catch(() => {
                if (request === requestRef.current)
                    setStatus('Unable to render this G-code.');
            });
    }, [gcode]);

    const options = useMemo<
        NonNullable<ComponentProps<typeof GCodeVisualizer>['options']>
    >(
        () => ({
            units: 'mm',
            boundingBox: { visible: true, labels: true },
            grid: {
                sizeX: 1000,
                sizeY: 1000,
                axisDepth: 200,
                labels: true,
                bounds: null,
            },
            camera: {
                projection: 'perspective',
                fov: 45,
                focusDurationMs: 250,
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
            className={`relative h-full flex flex-col rounded border overflow-hidden ${
                darkMode
                    ? 'border-robin-900 bg-[#0b1220]'
                    : 'border-slate-300 bg-white'
            }`}
        >
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
                className={`px-2 py-1 text-xs border-t ${
                    darkMode
                        ? 'text-slate-400 border-robin-900'
                        : 'text-slate-500 border-slate-200'
                }`}
            >
                {status}
            </div>
        </div>
    );
}
