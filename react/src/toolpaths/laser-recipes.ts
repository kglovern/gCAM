import type { LaserOptions } from './toolpathRequest';
import { laserOptions } from '../cam/laser.js';
export interface LaserRecipe {
    id: string;
    name: string;
    laser: string;
    machine: string;
    material: string;
    thickness: number;
    thicknessIndependent?: boolean;
    operation: string;
    feed: number;
    power: number;
    interval: number;
    overscan?: number;
    options: LaserOptions;
    source: string;
    family?: 'diode' | 'co2';
    opticalWatts?: number;
    estimated?: boolean;
}
const KEY = 'gcam.laserRecipes.v1';
export function validLaserRecipe(value: unknown): value is LaserRecipe {
    const r = value as LaserRecipe;
    return (
        !!r &&
        [
            'id',
            'name',
            'laser',
            'machine',
            'material',
            'operation',
            'source',
        ].every((k) => typeof r[k as keyof LaserRecipe] === 'string') &&
        r.feed > 0 &&
        Number.isFinite(r.feed) &&
        Number.isFinite(r.power) &&
        r.power >= 0 &&
        r.power <= 1000 &&
        r.interval > 0 &&
        Number.isFinite(r.interval) &&
        (r.overscan === undefined ||
            (Number.isFinite(r.overscan) && r.overscan >= 0)) &&
        r.thickness > 0 &&
        Number.isFinite(r.thickness) &&
        (r.thicknessIndependent === undefined ||
            (typeof r.thicknessIndependent === 'boolean' &&
                (!r.thicknessIndependent ||
                    ['laser-fill', 'laser-raster'].includes(r.operation)))) &&
        !!r.options &&
        typeof r.options === 'object' &&
        !Array.isArray(r.options)
    );
}

const LIBRARY_LIMIT = 1000;
const LIBRARY_BYTES = 2 * 1024 * 1024;
function portableRecipe(value: unknown): LaserRecipe {
    if (!validLaserRecipe(value)) throw new Error('Invalid material settings.');
    if (
        (value.family !== undefined &&
            !['diode', 'co2'].includes(value.family)) ||
        (value.opticalWatts !== undefined &&
            (!value.family ||
                !Number.isFinite(value.opticalWatts) ||
                value.opticalWatts < (value.family === 'diode' ? 1 : 40) ||
                value.opticalWatts > (value.family === 'diode' ? 40 : 250))) ||
        (value.estimated !== undefined && typeof value.estimated !== 'boolean')
    )
        throw new Error('Invalid laser hardware in material settings.');
    if (!['laser-cut', 'laser-fill', 'laser-raster'].includes(value.operation))
        throw new Error('Unsupported material operation.');
    const { imageCrop, imageMask, maskSourceIds, scanAlignment, ...options } =
        value.options;
    void imageCrop;
    void imageMask;
    void maskSourceIds;
    void scanAlignment;
    laserOptions(options);
    return { ...value, options };
}
export function exportLaserLibrary(recipes: LaserRecipe[]): string {
    if (recipes.length > LIBRARY_LIMIT)
        throw new Error('Too many material settings.');
    const text = JSON.stringify(
        {
            format: 'gcam-laser-materials',
            version: 1,
            recipes: recipes.map(portableRecipe),
        },
        null,
        2,
    );
    if (text.length > LIBRARY_BYTES || new Blob([text]).size > LIBRARY_BYTES)
        throw new Error('Material library exceeds 2 MB.');
    return text;
}
export function importLaserLibrary(
    text: string,
    existing: LaserRecipe[],
): LaserRecipe[] {
    if (text.length > LIBRARY_BYTES || new Blob([text]).size > LIBRARY_BYTES)
        throw new Error('Material library exceeds 2 MB.');
    const data = JSON.parse(text);
    if (
        data?.format !== 'gcam-laser-materials' ||
        data.version !== 1 ||
        !Array.isArray(data.recipes) ||
        data.recipes.length > LIBRARY_LIMIT
    )
        throw new Error('Unsupported material library.');
    const incoming = data.recipes.map(portableRecipe) as LaserRecipe[];
    if (new Set(incoming.map((r) => r.id)).size !== incoming.length)
        throw new Error('Duplicate material IDs in library.');
    const ids = new Set(existing.map((r) => r.id));
    const merged = [...existing, ...incoming.filter((r) => !ids.has(r.id))];
    if (merged.length > LIBRARY_LIMIT)
        throw new Error('Too many material settings.');
    return merged;
}
export function loadLaserRecipes(): LaserRecipe[] {
    try {
        const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(data) ? data.filter(validLaserRecipe) : [];
    } catch {
        return [];
    }
}
export function saveLaserRecipes(recipes: LaserRecipe[]) {
    if (!recipes.every(validLaserRecipe))
        throw new Error('Invalid laser recipe.');
    localStorage.setItem(KEY, JSON.stringify(recipes));
}
export function laserRecipeThicknessMatches(
    recipe: LaserRecipe,
    thickness: number,
) {
    return (
        (recipe.thicknessIndependent === true &&
            ['laser-fill', 'laser-raster'].includes(recipe.operation)) ||
        Math.abs(recipe.thickness - thickness) < 0.01
    );
}
export function matchingLaserRecipe(
    recipes: LaserRecipe[],
    context: Pick<
        LaserRecipe,
        'laser' | 'machine' | 'material' | 'thickness' | 'operation'
    > & { maxFeed?: number },
) {
    const eligible = [...recipes]
        .reverse()
        .filter(
            (r) =>
                r.laser === context.laser &&
                r.machine === context.machine &&
                r.material === context.material &&
                laserRecipeThicknessMatches(r, context.thickness) &&
                r.operation === context.operation &&
                (!context.maxFeed || r.feed <= context.maxFeed),
        );
    const exact = eligible.find((r) => !r.thicknessIndependent) ?? eligible[0];
    if (exact) return exact;
    const parsed = context.laser.match(/^(diode|co2):([\d.]+):/);
    if (!parsed) return undefined;
    const family = parsed[1] as 'diode' | 'co2',
        watts = Number(parsed[2]);
    if (
        !Number.isFinite(watts) ||
        watts < (family === 'diode' ? 1 : 40) ||
        watts > (family === 'diode' ? 40 : 250)
    )
        return undefined;
    const saved = recipes.filter(
        (r) =>
            r.family === family &&
            r.opticalWatts &&
            r.material === context.material &&
            laserRecipeThicknessMatches(r, context.thickness) &&
            r.operation === context.operation,
    );
    saved.sort(
        (a, b) =>
            Number(!!a.thicknessIndependent) -
                Number(!!b.thicknessIndependent) ||
            Math.abs(Math.log(watts / a.opticalWatts!)) -
                Math.abs(Math.log(watts / b.opticalWatts!)),
    );
    let reference = saved[0];
    if (
        !reference &&
        family === 'diode' &&
        context.operation !== 'laser-cut' &&
        context.material === 'plywood' &&
        [3, 6].some((t) => Math.abs(t - context.thickness) < 0.01)
    )
        reference = {
            ...context,
            id: 'diode-reference',
            name: '7W G2 engraving reference',
            feed: 1524,
            power: 1000,
            interval: 0.2,
            options: { passes: 1 },
            source: 'Sienci 7W G2 engraving guide',
            family: 'diode',
            opticalWatts: 7,
        };
    if (
        !reference &&
        family === 'co2' &&
        context.operation === 'laser-cut' &&
        context.material === 'plywood' &&
        Math.abs(context.thickness - 3) < 0.01
    )
        reference = {
            ...context,
            id: 'co2-reference',
            name: '150W plywood reference',
            feed: 3000,
            power: 600,
            interval: 0.2,
            options: { passes: 1 },
            source: 'OMTech 150W plywood guide; air assist required',
            family: 'co2',
            opticalWatts: 150,
        };
    const estimated = reference
        ? scaleLaserRecipe(reference, context, watts)
        : undefined;
    if (estimated && context.maxFeed && estimated.feed > context.maxFeed) {
        estimated.power = Math.round(
            (estimated.power * context.maxFeed) / estimated.feed,
        );
        estimated.feed = context.maxFeed;
        estimated.source += ' · motion limit';
    }
    return estimated;
}
/** First-order equal line energy: P/v. Never transfer between diode and CO2. */
export function scaleLaserRecipe(
    reference: LaserRecipe,
    context: Pick<
        LaserRecipe,
        'laser' | 'machine' | 'material' | 'thickness' | 'operation'
    > & { maxFeed?: number },
    watts: number,
): LaserRecipe | undefined {
    const sourceWatts = reference.opticalWatts;
    if (
        !sourceWatts ||
        !Number.isFinite(sourceWatts) ||
        sourceWatts <= 0 ||
        !Number.isFinite(watts) ||
        watts <= 0
    )
        return undefined;
    return {
        ...reference,
        ...context,
        id: `estimate-${reference.id}`,
        feed: Math.max(1, Math.round((reference.feed * watts) / sourceWatts)),
        opticalWatts: watts,
        estimated: true,
        source: `Estimated from ${sourceWatts} W — ${reference.source}`,
    };
}

export function laserCalibrationRange(
    reference: Pick<LaserRecipe, 'feed' | 'power'> | undefined,
    motionLimit = 3000,
) {
    const limit =
        Number.isFinite(motionLimit) && motionLimit > 0 ? motionLimit : 3000;
    const feed = Math.min(reference?.feed ?? Math.min(3000, limit), limit);
    return {
        minFeed: Math.max(1, Math.round(feed * 0.75)),
        maxFeed: Math.max(1, Math.round(Math.min(limit, feed * 1.25))),
        minPower: reference ? Math.max(1, Math.round(reference.power / 20)) : 5,
        maxPower: reference
            ? Math.max(1, Math.round(reference.power / 10))
            : 20,
    };
}
