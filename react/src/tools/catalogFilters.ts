import type { LibraryTool } from '../lib/library';

export interface CatalogFilters {
    search: string;
    type: string;
    shank: string;
    flutes: string;
    angle: string;
    minDiameter: number | null;
    maxDiameter: number | null;
    minLength: number | null;
    maxLength: number | null;
}
export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
    search: '',
    type: 'all',
    shank: '',
    flutes: '',
    angle: '',
    minDiameter: null,
    maxDiameter: null,
    minLength: null,
    maxLength: null,
};
const normalize = (text: string) =>
    text.normalize('NFKC').toLowerCase().replace(/⁄/g, '/');
const range = (value: number | null, min: number | null, max: number | null) =>
    (min == null && max == null) ||
    (value != null &&
        Number.isFinite(value) &&
        (min == null || value >= min - 1e-8) &&
        (max == null || value <= max + 1e-8));

/** Numeric filters use millimetres; missing catalog values never match an active range. */
export function matchesCatalogFilters(
    tool: LibraryTool,
    filters: CatalogFilters,
): boolean {
    const text = normalize(
        [
            tool.id,
            tool.name,
            tool.description,
            tool.vendorDisplayName,
            tool.vendor,
            tool.fluteType,
            tool.cutterMaterial,
            tool.coating,
        ]
            .filter(Boolean)
            .join(' '),
    );
    return (
        normalize(filters.search)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .every((term) => text.includes(term)) &&
        (filters.type === 'all' || tool.toolType === filters.type) &&
        (!filters.shank || tool.shankDiameterMm === Number(filters.shank)) &&
        (!filters.flutes || tool.flutes === Number(filters.flutes)) &&
        (!filters.angle ||
            (tool.toolType === 'v-bit' &&
                tool.fluteAngleDeg === Number(filters.angle))) &&
        range(
            tool.cuttingDiameterMm,
            filters.minDiameter,
            filters.maxDiameter,
        ) &&
        range(tool.cuttingLengthMm, filters.minLength, filters.maxLength)
    );
}
