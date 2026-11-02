import { laserOptions, LASER_DEFAULTS } from '../cam/laser.js';
import type { LaserOptions } from './toolpathRequest';
export const IMAGE_KEYS = [
    'imageMode',
    'passThrough',
    'threshold',
    'invert',
    'brightness',
    'contrast',
    'grayscale',
    'shadeCount',
    'smoothing',
    'sharpening',
    'filterRadius',
    'sharpeningDenoise',
    'halftoneCellSize',
    'halftoneAngle',
    'edgeGain',
] as const;
export const IMAGE_PRESET_FIELDS = [
    'gamma',
    'interval',
    ...IMAGE_KEYS,
] as const;
export type ImagePresetField = (typeof IMAGE_PRESET_FIELDS)[number];
export interface ImagePreset {
    id: string;
    name: string;
    gamma?: number;
    interval?: number;
    options: Pick<LaserOptions, (typeof IMAGE_KEYS)[number]>;
}
const KEY = 'gcam.laserImagePresets.v2';
const LEGACY_KEY = 'gcam.laserImagePresets.v1';
function validate(value: unknown): ImagePreset {
    const p = value as ImagePreset;
    if (
        !p ||
        typeof p.id !== 'string' ||
        !p.id.length ||
        p.id.length > 128 ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 100 ||
        (p.gamma !== undefined &&
            (!Number.isFinite(p.gamma) || p.gamma <= 0)) ||
        (p.interval !== undefined &&
            (!Number.isFinite(p.interval) || p.interval <= 0)) ||
        !p.options ||
        typeof p.options !== 'object' ||
        Array.isArray(p.options) ||
        Object.keys(p.options).some(
            (key) => !IMAGE_KEYS.includes(key as (typeof IMAGE_KEYS)[number]),
        )
    )
        throw new Error('Invalid image preset.');
    if (
        p.gamma === undefined &&
        p.interval === undefined &&
        !Object.keys(p.options).length
    )
        throw new Error('Select at least one image setting.');
    laserOptions(p.options);
    return p;
}
export function captureImagePreset(
    id: string,
    name: string,
    gamma: number,
    options: LaserOptions,
    selection?: { fields: ImagePresetField[]; interval: number },
): ImagePreset {
    if (
        selection &&
        (!Array.isArray(selection.fields) ||
            new Set(selection.fields).size !== selection.fields.length ||
            selection.fields.some(
                (field) => !IMAGE_PRESET_FIELDS.includes(field),
            ))
    )
        throw new Error('Invalid image preset fields.');
    const fields = selection ? new Set(selection.fields) : null;
    if (
        (fields?.has('gamma') && (!Number.isFinite(gamma) || gamma <= 0)) ||
        (fields?.has('interval') &&
            (!Number.isFinite(selection!.interval) || selection!.interval <= 0))
    )
        throw new Error('Invalid image preset.');
    const values = Object.fromEntries(
        IMAGE_KEYS.map((key) => [
            key,
            options[key] === undefined && fields
                ? LASER_DEFAULTS[key]
                : options[key],
        ]),
    );
    return validate({
        id,
        name: name.trim(),
        ...(!fields || fields.has('gamma') ? { gamma } : {}),
        ...(fields?.has('interval') ? { interval: selection!.interval } : {}),
        options: Object.fromEntries(
            IMAGE_KEYS.filter(
                (key) =>
                    (!fields || fields.has(key)) && values[key] !== undefined,
            ).map((key) => [key, values[key]]),
        ),
    });
}
export function loadImagePresets(): ImagePreset[] {
    try {
        const list = JSON.parse(
            localStorage.getItem(KEY) ??
                localStorage.getItem(LEGACY_KEY) ??
                '[]',
        );
        return Array.isArray(list)
            ? list.slice(0, 1000).filter((p) => {
                  try {
                      validate(p);
                      return true;
                  } catch {
                      return false;
                  }
              })
            : [];
    } catch {
        return [];
    }
}
export function exportImagePresets(presets: ImagePreset[]) {
    if (presets.length > 1000) throw new Error('Too many image presets.');
    const text = JSON.stringify(
        {
            format: 'gcam-image-presets',
            version: presets.some(
                (p) =>
                    p.gamma === undefined ||
                    p.interval !== undefined ||
                    p.options.filterRadius !== undefined ||
                    p.options.sharpeningDenoise !== undefined,
            )
                ? 2
                : 1,
            presets: presets.map(validate),
        },
        null,
        2,
    );
    if (new Blob([text]).size > 2 * 1024 * 1024)
        throw new Error('Image presets exceed 2 MB.');
    return text;
}
export function saveImagePresets(presets: ImagePreset[]) {
    exportImagePresets(presets);
    localStorage.setItem(KEY, JSON.stringify(presets));
}
export function importImagePresets(text: string, existing: ImagePreset[]) {
    if (
        text.length > 2 * 1024 * 1024 ||
        new Blob([text]).size > 2 * 1024 * 1024
    )
        throw new Error('Image presets exceed 2 MB.');
    const data = JSON.parse(text);
    if (
        data?.format !== 'gcam-image-presets' ||
        (data.version !== 1 && data.version !== 2) ||
        !Array.isArray(data.presets) ||
        data.presets.length > 1000
    )
        throw new Error('Unsupported image preset file.');
    const incoming = data.presets.map(validate) as ImagePreset[];
    if (
        data.version === 1 &&
        incoming.some(
            (p) =>
                p.gamma === undefined ||
                p.interval !== undefined ||
                p.options.filterRadius !== undefined ||
                p.options.sharpeningDenoise !== undefined,
        )
    )
        throw new Error('Invalid version 1 image preset.');
    if (new Set(incoming.map((p) => p.id)).size !== incoming.length)
        throw new Error('Duplicate image preset IDs.');
    const ids = new Set(existing.map((p) => p.id));
    const merged = [...existing, ...incoming.filter((p) => !ids.has(p.id))];
    exportImagePresets(merged);
    return merged;
}

export function imagePresetFields(preset: ImagePreset): ImagePresetField[] {
    return IMAGE_PRESET_FIELDS.filter((field) =>
        field === 'gamma'
            ? preset.gamma !== undefined
            : field === 'interval'
              ? preset.interval !== undefined
              : preset.options[field] !== undefined,
    );
}
