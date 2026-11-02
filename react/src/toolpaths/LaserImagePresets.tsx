import { useState } from 'react';
import { saveTextFile } from '../platform/saveTextFile';
import {
    captureImagePreset,
    IMAGE_PRESET_FIELDS,
    imagePresetFields,
    type ImagePresetField,
    exportImagePresets,
    importImagePresets,
    loadImagePresets,
    saveImagePresets,
    type ImagePreset,
} from './image-presets';
import type { LaserOptions } from './toolpathRequest';
export function LaserImagePresets({
    gamma,
    interval,
    options,
    onApply,
}: {
    gamma: number;
    interval: number;
    options: LaserOptions;
    onApply(preset: ImagePreset): void;
}) {
    const [fields, setFields] = useState<ImagePresetField[]>(() => [
        ...IMAGE_PRESET_FIELDS,
    ]);
    const [presets, setPresets] = useState(loadImagePresets);
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [removed, setRemoved] = useState<ImagePreset | null>(null);
    const current = presets.find((p) => p.id === selected);
    const commit = (next: ImagePreset[]) => {
        saveImagePresets(next);
        setPresets(next);
        setError('');
    };
    const attempt = (action: () => void) => {
        try {
            action();
        } catch (e) {
            setError((e as Error).message);
        }
    };
    return (
        <details className="col-span-2 rounded border p-2">
            <summary className="cursor-pointer">Image presets</summary>
            <div className="mt-2 space-y-2">
                <select
                    aria-label="Image preset"
                    className="w-full rounded border bg-transparent px-2 py-1"
                    value={selected}
                    onChange={(e) => {
                        setSelected(e.target.value);
                        const preset = presets.find(
                            (p) => p.id === e.target.value,
                        );
                        setFields(
                            preset
                                ? imagePresetFields(preset)
                                : [...IMAGE_PRESET_FIELDS],
                        );
                        setName(
                            presets.find((p) => p.id === e.target.value)
                                ?.name ?? '',
                        );
                    }}
                >
                    <option value="">Choose preset</option>
                    {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={!current}
                        className="underline disabled:opacity-40"
                        onClick={() => {
                            if (current) onApply(current);
                        }}
                    >
                        Apply image preset
                    </button>
                    <button
                        type="button"
                        disabled={!current}
                        className="underline disabled:opacity-40"
                        onClick={() =>
                            attempt(() => {
                                if (current) {
                                    commit(
                                        presets.filter(
                                            (p) => p.id !== current.id,
                                        ),
                                    );
                                    setRemoved(current);
                                    setSelected('');
                                }
                            })
                        }
                    >
                        Remove
                    </button>
                    {removed && (
                        <button
                            type="button"
                            className="underline"
                            onClick={() =>
                                attempt(() => {
                                    if (
                                        !presets.some(
                                            (p) => p.id === removed.id,
                                        )
                                    )
                                        commit([...presets, removed]);
                                    setRemoved(null);
                                })
                            }
                        >
                            Undo remove
                        </button>
                    )}
                </div>
                <input
                    aria-label="Image preset name"
                    placeholder="Preset name"
                    maxLength={100}
                    className="w-full rounded border bg-transparent px-2 py-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <details className="rounded border p-2">
                    <summary className="cursor-pointer">
                        Settings to save ({fields.length})
                    </summary>
                    <fieldset className="mt-2 space-y-2">
                        <legend className="sr-only">
                            Include in image preset
                        </legend>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                    setFields([...IMAGE_PRESET_FIELDS])
                                }
                            >
                                All
                            </button>
                            <button
                                type="button"
                                className="underline"
                                onClick={() => setFields([])}
                            >
                                None
                            </button>
                            <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                    setFields((current) =>
                                        IMAGE_PRESET_FIELDS.filter(
                                            (field) => !current.includes(field),
                                        ),
                                    )
                                }
                            >
                                Invert
                            </button>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-3 gap-y-1">
                            {IMAGE_PRESET_FIELDS.map((field) => (
                                <label
                                    key={field}
                                    className="flex items-center gap-2"
                                >
                                    <input
                                        type="checkbox"
                                        aria-label={`Include ${FIELD_LABELS[field]}`}
                                        checked={fields.includes(field)}
                                        onChange={(e) =>
                                            setFields((current) =>
                                                e.target.checked
                                                    ? [...current, field]
                                                    : current.filter(
                                                          (key) =>
                                                              key !== field,
                                                      ),
                                            )
                                        }
                                    />
                                    <span className="sr-only">Include </span>
                                    <span>{FIELD_LABELS[field]}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </details>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        disabled={!name.trim() || !fields.length}
                        className="underline disabled:opacity-40"
                        onClick={() =>
                            attempt(() => {
                                const old = presets.find(
                                    (p) =>
                                        p.name.toLowerCase() ===
                                        name.trim().toLowerCase(),
                                );
                                const next = captureImagePreset(
                                    old?.id ?? crypto.randomUUID(),
                                    name,
                                    gamma,
                                    options,
                                    { fields, interval },
                                );
                                commit(
                                    old
                                        ? presets.map((p) =>
                                              p.id === old.id ? next : p,
                                          )
                                        : [...presets, next],
                                );
                                setSelected(next.id);
                            })
                        }
                    >
                        Save image preset
                    </button>
                    <button
                        type="button"
                        disabled={!presets.length}
                        className="underline disabled:opacity-40"
                        onClick={() =>
                            attempt(() =>
                                saveTextFile(
                                    exportImagePresets(presets),
                                    'laser-image-presets.json',
                                    'application/json',
                                ),
                            )
                        }
                    >
                        Export presets
                    </button>
                    <label className="cursor-pointer underline">
                        Import presets
                        <input
                            aria-label="Import image presets"
                            className="sr-only"
                            type="file"
                            accept=".json,application/json"
                            onChange={async (e) => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (!file) return;
                                try {
                                    if (file.size > 2 * 1024 * 1024)
                                        throw new Error(
                                            'Image presets exceed 2 MB.',
                                        );
                                    commit(
                                        importImagePresets(
                                            await file.text(),
                                            presets,
                                        ),
                                    );
                                } catch (error) {
                                    setError((error as Error).message);
                                }
                            }}
                        />
                    </label>
                </div>
                {error && <p role="alert">{error}</p>}
            </div>
        </details>
    );
}

const FIELD_LABELS: Record<ImagePresetField, string> = {
    gamma: 'Gamma',
    interval: 'Resolution (DPI)',
    imageMode: 'Image mode',
    passThrough: 'Pixel pass-through',
    threshold: 'Threshold',
    invert: 'Invert image',
    brightness: 'Brightness',
    contrast: 'Contrast',
    grayscale: 'Grayscale channel',
    shadeCount: 'Shades',
    smoothing: 'Smoothing',
    sharpening: 'Sharpening',
    filterRadius: 'Filter radius',
    sharpeningDenoise: 'Sharpening denoise',
    halftoneCellSize: 'Dot spacing',
    halftoneAngle: 'Pattern angle',
    edgeGain: 'Edge strength',
};
