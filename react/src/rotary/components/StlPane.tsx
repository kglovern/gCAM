/**
 * Purpose: Rotary STL tab pane — import a Z-up mesh as the rotary surface
 * and show its stats. The 3D view shows the mesh triangles directly.
 */
import { useRef, type ReactElement } from 'react';
import type { StlInfo } from '../useRotaryState';

interface StlPaneProps {
    stlName: string | null;
    stlInfo: StlInfo | null;
    compR: number;
    onImportStl: (file: File) => void;
}

export function StlPane({
    stlName,
    stlInfo,
    compR,
    onImportStl,
}: StlPaneProps): ReactElement {
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <div className="p-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                STL{' '}
                <small className="font-normal text-slate-500 dark:text-slate-400">
                    Imported 3D model
                </small>
            </h2>
            <div className="mt-2 flex items-center gap-2">
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
                        if (file) {
                            onImportStl(file);
                        }
                        event.currentTarget.value = '';
                    }}
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {stlName ?? 'no file loaded'}
                </span>
            </div>
            {stlInfo && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                    <dt className="text-slate-500 dark:text-slate-400">
                        Triangles
                    </dt>
                    <dd>{stlInfo.tris.toLocaleString()}</dd>
                    <dt className="text-slate-500 dark:text-slate-400">
                        Mesh X / Y / Z
                    </dt>
                    <dd>
                        {stlInfo.sx} / {stlInfo.sy} / {stlInfo.sz} mm
                    </dd>
                    <dt className="text-slate-500 dark:text-slate-400">
                        Work length
                    </dt>
                    <dd>{stlInfo.len} mm</dd>
                    <dt className="text-slate-500 dark:text-slate-400">
                        Max Ø
                    </dt>
                    <dd>{stlInfo.maxDia} mm</dd>
                    <dt className="text-slate-500 dark:text-slate-400">
                        Toolpath from
                    </dt>
                    <dd>
                        silhouette envelope, tooltip comp R{compR.toFixed(2)}
                    </dd>
                </dl>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Machining follows the model's radial silhouette; the preview
                shows the original mesh. Choose Draw a profile to edit the
                fitted outline as a profile job. STL coordinates are read in mm.
            </p>
        </div>
    );
}
