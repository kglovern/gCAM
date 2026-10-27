import { useRef, useState, type ReactElement } from 'react';
import { SurfaceUnitsModal } from '../../document/SurfaceUnitsModal';
import { meshBounds, parseSTL } from '../engine/stl';
import type { StlInfo } from '../useRotaryState';

type Axis = 'auto' | 'x' | 'y' | 'z';
export function StlPane({
    stlName,
    stlInfo,
    onImportStl,
}: {
    stlName: string | null;
    stlInfo: StlInfo | null;
    compR: number;
    onImportStl(file: File, axis: Axis, center: boolean, scale: number): void;
}): ReactElement {
    const fileRef = useRef<HTMLInputElement>(null);
    const [axis, setAxis] = useState<Axis>('auto');
    const [center, setCenter] = useState(true);
    const [error, setError] = useState('');
    const [pending, setPending] = useState<{
        file: File;
        size: { x: number; y: number; z: number };
    } | null>(null);
    const chooseFile = async (file: File) => {
        setError('');
        try {
            const { mn, mx } = meshBounds(parseSTL(await file.arrayBuffer()));
            setPending({
                file,
                size: { x: mx[0] - mn[0], y: mx[1] - mn[1], z: mx[2] - mn[2] },
            });
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Could not read this STL.',
            );
        }
    };
    return (
        <div id="rotary-model-setup" className="space-y-3 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="min-h-11 rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-robin-900 dark:hover:bg-dark-lighter"
                >
                    Import STL
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".stl"
                    className="hidden"
                    aria-label="Import STL file"
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void chooseFile(file);
                        event.currentTarget.value = '';
                    }}
                />
                <span className="break-words text-slate-700 dark:text-slate-200">
                    {stlName ??
                        'Open a model to place it between the chuck and tailstock.'}
                </span>
            </div>
            {stlInfo && (
                <p className="text-slate-600 dark:text-slate-300">
                    Model: {stlInfo.len} mm long · maximum diameter{' '}
                    {stlInfo.maxDia} mm
                </p>
            )}
            <details className="text-slate-600 dark:text-slate-300">
                <summary className="cursor-pointer">
                    Model details and orientation
                </summary>
                <div className="mt-3 space-y-3">
                    <label className="block">
                        Model length direction
                        <select
                            aria-label="STL longitudinal axis"
                            value={axis}
                            onChange={(event) =>
                                setAxis(event.target.value as Axis)
                            }
                            className="ml-2 rounded border bg-transparent p-2"
                        >
                            <option value="auto">
                                Automatic (longest side)
                            </option>
                            <option value="z">Upright (Z)</option>
                            <option value="x">Left to right (X)</option>
                            <option value="y">Front to back (Y)</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={center}
                            onChange={(event) =>
                                setCenter(event.target.checked)
                            }
                        />
                        Centre the model on the rotary axis
                    </label>
                    <p className="text-xs">
                        Orientation applies when importing. Reimport to change
                        it.
                    </p>
                    {stlInfo && (
                        <p className="text-xs">
                            {stlInfo.tris.toLocaleString()} triangles ·{' '}
                            {stlInfo.sx} × {stlInfo.sy} × {stlInfo.sz} mm
                        </p>
                    )}
                </div>
            </details>
            {error && (
                <p role="alert" className="text-red-700 dark:text-red-300">
                    {error}
                </p>
            )}
            {pending && (
                <SurfaceUnitsModal
                    fileName={pending.file.name}
                    sizeMm={pending.size}
                    onCancel={() => setPending(null)}
                    onApply={(units) => {
                        onImportStl(
                            pending.file,
                            axis,
                            center,
                            units === 'inch' ? 25.4 : 1,
                        );
                        setPending(null);
                    }}
                />
            )}
        </div>
    );
}
