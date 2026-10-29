import { EMPTY_CATALOG_FILTERS, matchesCatalogFilters } from './catalogFilters';
import { normalizeLibraryTool } from '../lib/library';
const tool = normalizeLibraryTool({
    id: 'sku-123',
    name: '¼ inch Downcut',
    vendor: 'Sienci',
    toolType: 'flat',
    cuttingDiameterMm: 6.35,
    shankDiameterMm: 6.35,
    cuttingLengthMm: 25.4,
    flutes: 2,
});
test('search terms combine with physical parameters', () => {
    expect(
        matchesCatalogFilters(tool, {
            ...EMPTY_CATALOG_FILTERS,
            search: '1/4 downcut sienci',
            shank: '6.35',
            flutes: '2',
            minDiameter: 6,
            maxDiameter: 7,
            minLength: 25,
        }),
    ).toBe(true);
    expect(
        matchesCatalogFilters(tool, {
            ...EMPTY_CATALOG_FILTERS,
            search: 'upcut',
        }),
    ).toBe(false);
    expect(
        matchesCatalogFilters(tool, { ...EMPTY_CATALOG_FILTERS, flutes: '3' }),
    ).toBe(false);
});
test('numeric ranges exclude unknown values and contradictory bounds', () => {
    expect(
        matchesCatalogFilters(
            { ...tool, cuttingDiameterMm: null },
            { ...EMPTY_CATALOG_FILTERS, minDiameter: 1 },
        ),
    ).toBe(false);
    expect(
        matchesCatalogFilters(tool, {
            ...EMPTY_CATALOG_FILTERS,
            minDiameter: 7,
            maxDiameter: 6,
        }),
    ).toBe(false);
    expect(
        matchesCatalogFilters(
            { ...tool, cuttingLengthMm: null },
            EMPTY_CATALOG_FILTERS,
        ),
    ).toBe(true);
});
test('angle applies only to v-bits with the requested angle', () => {
    expect(
        matchesCatalogFilters(
            { ...tool, fluteAngleDeg: 60 },
            { ...EMPTY_CATALOG_FILTERS, angle: '60' },
        ),
    ).toBe(false);
    expect(
        matchesCatalogFilters(
            { ...tool, toolType: 'v-bit', fluteAngleDeg: 60 },
            { ...EMPTY_CATALOG_FILTERS, angle: '60' },
        ),
    ).toBe(true);
});
