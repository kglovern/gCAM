import { useState } from 'react';
import {
    machineUpToSetupAngles,
    setupAnglesToMachineUp,
} from '../engine/surface-model';

/**
 * Purpose: Document state, import, file, or persistence module for BitmapImportModal.
 */
interface BitmapChoice {
    fileName: string;
    isSurfaceModel?: boolean;
    surfaceMachinableTopDown?: boolean;
    surfacePreviewUrl?: string;
    machineUp?: [number, number, number];
}

export interface BitmapImportModalProps {
    choice: BitmapChoice;
    onUseBitmap(): void;
    onTrace(): void;
    onSetupOrientation?(machineUp: [number, number, number]): Promise<void>;
    onCancel(): void;
}

/** Explicitly chooses bitmap raster workflow versus destructive trace replace. */
export function BitmapImportModal({
    choice,
    onUseBitmap,
    onTrace,
    onSetupOrientation,
    onCancel,
}: BitmapImportModalProps) {
    const initialAngles = machineUpToSetupAngles(choice.machineUp ?? [0, 0, 1]);
    const [azimuth, setAzimuth] = useState(initialAngles.azimuthDeg);
    const [elevation, setElevation] = useState(initialAngles.elevationDeg);
    const [updating, setUpdating] = useState(false);
    const applyOrientation = async (
        nextAzimuth = azimuth,
        nextElevation = elevation,
    ) => {
        if (!onSetupOrientation) return;
        setUpdating(true);
        try {
            await onSetupOrientation(
                setupAnglesToMachineUp(nextAzimuth, nextElevation),
            );
        } finally {
            setUpdating(false);
        }
    };
    const facePresets = [
        { label: 'Top', face: '+Z', azimuth: 0, elevation: 90 },
        { label: 'Bottom', face: '−Z', azimuth: 0, elevation: -90 },
        { label: 'Front', face: '+Y', azimuth: 0, elevation: 0 },
        { label: 'Back', face: '−Y', azimuth: 180, elevation: 0 },
        { label: 'Left', face: '−X', azimuth: -90, elevation: 0 },
        { label: 'Right', face: '+X', azimuth: 90, elevation: 0 },
    ];
    const activePreset = facePresets.find(
        (preset) =>
            Math.abs(preset.azimuth - initialAngles.azimuthDeg) <= 1 &&
            Math.abs(preset.elevation - initialAngles.elevationDeg) <= 1,
    )?.face;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bitmap-import-title"
        >
            <div className="w-full max-w-lg max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark">
                <h2
                    id="bitmap-import-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    {choice.isSurfaceModel
                        ? 'Place this 3D model?'
                        : 'How should this bitmap be used?'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {choice.isSurfaceModel
                        ? 'On the canvas, it appears as a 2D height map that you can move, resize, or rotate. gCAM keeps the 3D model for cutting.'
                        : 'Keep it as pixels for laser raster, wavy, halftone, or heightmap work; or trace it into editable cut vectors.'}
                </p>
                {choice.isSurfaceModel && choice.surfacePreviewUrl && (
                    <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-2 dark:border-robin-800 dark:bg-dark-lighter">
                        <img
                            src={choice.surfacePreviewUrl}
                            alt="Top-view heightmap preview"
                            className="mx-auto max-h-44 max-w-full object-contain"
                        />
                    </div>
                )}
                {choice.isSurfaceModel && onSetupOrientation && (
                    <section
                        className="mt-4 rounded-md border border-slate-200 p-3 dark:border-robin-800"
                        aria-label="Model orientation"
                    >
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                            Which side will face up?
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                            Choose the side that will face the cutter. This sets
                            the top-down preview and the direction of the 3D
                            toolpaths.
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {facePresets.map((preset) => (
                                <button
                                    key={preset.face}
                                    type="button"
                                    disabled={updating}
                                    aria-pressed={activePreset === preset.face}
                                    aria-label={`${preset.label} face up`}
                                    title={`Place the model ${preset.label.toLowerCase()} up`}
                                    onClick={() => {
                                        setAzimuth(preset.azimuth);
                                        setElevation(preset.elevation);
                                        void applyOrientation(
                                            preset.azimuth,
                                            preset.elevation,
                                        );
                                    }}
                                    className={`rounded-md border px-2 py-2 text-xs font-medium disabled:opacity-50 ${activePreset === preset.face ? 'border-robin-500 bg-robin-100 text-slate-900 dark:bg-robin-900 dark:text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-robin-800 dark:text-slate-200 dark:hover:bg-dark-lighter'}`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <details className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                            <summary className="cursor-pointer select-none">
                                Fine-tune direction
                            </summary>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <label>
                                    Azimuth ({azimuth}°)
                                    <input
                                        aria-label="Setup azimuth"
                                        type="range"
                                        min="-180"
                                        max="180"
                                        step="1"
                                        value={azimuth}
                                        onChange={(event) =>
                                            setAzimuth(
                                                Number(
                                                    event.currentTarget.value,
                                                ),
                                            )
                                        }
                                        className="mt-1 block w-full"
                                    />
                                </label>
                                <label>
                                    Elevation ({elevation}°)
                                    <input
                                        aria-label="Setup elevation"
                                        type="range"
                                        min="-90"
                                        max="90"
                                        step="1"
                                        value={elevation}
                                        onChange={(event) =>
                                            setElevation(
                                                Number(
                                                    event.currentTarget.value,
                                                ),
                                            )
                                        }
                                        className="mt-1 block w-full"
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                disabled={updating}
                                onClick={() => void applyOrientation()}
                                className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-robin-700 dark:text-white dark:hover:bg-dark-lighter"
                            >
                                {updating
                                    ? 'Updating preview…'
                                    : 'Apply fine-tuned direction'}
                            </button>
                        </details>
                    </section>
                )}
                {choice.isSurfaceModel && (
                    <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                        {choice.surfaceMachinableTopDown === false
                            ? 'This model is standing on its edge or has no face pointing up. Choose a side above before placing it.'
                            : 'A top-down cutter can only reach surfaces visible from above. Hidden undersides and tucked-under areas will not be cut.'}
                    </p>
                )}
                <div
                    className={`mt-5 grid gap-3 ${choice.isSurfaceModel ? '' : 'sm:grid-cols-2'}`}
                >
                    <button
                        disabled={
                            choice.isSurfaceModel &&
                            choice.surfaceMachinableTopDown === false
                        }
                        onClick={onUseBitmap}
                        className="rounded-lg border border-robin-500 bg-robin-500 px-4 py-3 text-left text-sm font-medium text-white hover:bg-robin-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {choice.isSurfaceModel
                            ? choice.surfaceMachinableTopDown === false
                                ? 'Choose which side faces up'
                                : 'Place 3D model'
                            : 'Use as bitmap'}
                        <span className="mt-1 block text-xs font-normal text-white/80">
                            {choice.isSurfaceModel
                                ? 'Keep 3D model for machining'
                                : 'Raster, halftone, wavy, heightmap'}
                        </span>
                    </button>
                    {!choice.isSurfaceModel && (
                        <button
                            onClick={onTrace}
                            className="rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-robin-700 dark:text-white dark:hover:bg-dark-lighter"
                        >
                            Convert to vector
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                                Trace and replace with editable paths
                            </span>
                        </button>
                    )}
                </div>
                <button
                    onClick={onCancel}
                    className="mt-4 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                    Cancel
                </button>
                <span className="sr-only">{choice.fileName}</span>
            </div>
        </div>
    );
}
