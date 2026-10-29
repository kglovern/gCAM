/**
 * Purpose: Implementation module for ToolCatalogSelect in the react domain.
 */
import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { LibraryTool } from '../lib/library';
import type { UnitSystem } from '../lib/units';
import { displayValue, lengthUnit, toMm } from '../lib/units';
import { CatalogFilterColumn } from './CatalogFilterColumn';
import { catalogGroups } from './toolCatalog';
import {
    EMPTY_CATALOG_FILTERS,
    matchesCatalogFilters,
    type CatalogFilters,
} from './catalogFilters';

export function ToolCatalogSelect({
    catalog,
    catalogError,
    selectedId,
    units,
    className,
    onSelect,
}: {
    catalog: LibraryTool[];
    catalogError: string;
    selectedId: string;
    units: UnitSystem;
    className: string;
    onSelect: (id: string) => void;
}) {
    const radioName = useId();
    const [filterReset, setFilterReset] = useState(0);
    const [filters, setFilters] = useState<CatalogFilters>(
        EMPTY_CATALOG_FILTERS,
    );
    const [lengthDrafts, setLengthDrafts] = useState<
        Partial<
            Record<
                'minDiameter' | 'maxDiameter' | 'minLength' | 'maxLength',
                string
            >
        >
    >({});
    const filteredCatalog = catalog.filter((tool) =>
        matchesCatalogFilters(tool, filters),
    );
    const update = <K extends keyof CatalogFilters>(
        key: K,
        value: CatalogFilters[K],
    ) => setFilters((current) => ({ ...current, [key]: value }));
    const values = (
        key:
            | 'flutes'
            | 'shankDiameterMm'
            | 'fluteAngleDeg'
            | 'cuttingDiameterMm'
            | 'cuttingLengthMm',
    ) =>
        [
            ...new Set(
                catalog
                    .filter(
                        (tool) =>
                            key !== 'fluteAngleDeg' ||
                            tool.toolType === 'v-bit',
                    )
                    .map((tool) => tool[key])
                    .filter(
                        (value): value is number =>
                            value != null && Number.isFinite(value),
                    ),
            ),
        ].sort((a, b) => a - b);
    const lengthField = (
        key: 'minDiameter' | 'maxDiameter' | 'minLength' | 'maxLength',
        label: string,
    ) => (
        <label className="block shrink-0 text-xs text-slate-600 dark:text-slate-300">
            {label.startsWith('Min') ? 'Min' : 'Max'}
            <input
                aria-label={`${label} (${lengthUnit(units)})`}
                className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs dark:border-robin-900 dark:bg-slate-900 dark:text-slate-100"
                type="number"
                min="0"
                step="any"
                value={
                    lengthDrafts[key] ??
                    (filters[key] == null
                        ? ''
                        : displayValue(filters[key], units, 4))
                }
                onChange={(event) => {
                    const value = event.target.value;
                    setLengthDrafts((current) => ({
                        ...current,
                        [key]: value,
                    }));
                    update(
                        key,
                        value === '' ? null : toMm(Number(value), units),
                    );
                }}
                onBlur={() => setLengthDrafts({})}
            />
        </label>
    );
    const selected = catalog.find((tool) => tool.id === selectedId);
    const size = (value: number | null | undefined) =>
        value == null ? '—' : displayValue(value, units, 4);
    const renderToolRow = (tool: LibraryTool, outsideFilters = false) => (
        <label
            key={tool.id}
            className={`grid cursor-pointer grid-cols-[minmax(260px,1fr)_100px_80px_80px_60px_80px] items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-robin-950 ${selectedId === tool.id ? 'bg-sky-50 dark:bg-robin-900/40' : ''}`}
        >
            <span className="flex min-w-0 items-center gap-3">
                <input
                    type="radio"
                    name={radioName}
                    aria-label={tool.name}
                    checked={selectedId === tool.id}
                    onChange={() => onSelect(tool.id)}
                />
                {tool.image && (
                    <img
                        src={tool.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded bg-white object-contain"
                    />
                )}
                <span className="min-w-0">
                    <span className="block font-medium">{tool.name}</span>
                    <span className="block text-slate-500 dark:text-slate-400">
                        {tool.vendorDisplayName}
                        {outsideFilters
                            ? ' · Current selection (outside filters)'
                            : ''}
                    </span>
                </span>
            </span>
            <span>
                {(
                    {
                        flat: 'Flat',
                        ball: 'Ball',
                        ballnose: 'Ball nose',
                        surfacing: 'Surfacing',
                        drill: 'Drill',
                        'v-bit': 'V-bit',
                        specialty: 'Specialty',
                    } as Record<string, string>
                )[tool.toolType] ?? tool.toolType}
                {tool.toolType === 'v-bit' && tool.fluteAngleDeg != null
                    ? ` ${tool.fluteAngleDeg}°`
                    : ''}
            </span>
            <span>{size(tool.cuttingDiameterMm)}</span>
            <span>{size(tool.shankDiameterMm)}</span>
            <span>{tool.flutes ?? '—'}</span>
            <span>{size(tool.cuttingLengthMm)}</span>
        </label>
    );
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
            <label className="block shrink-0 text-xs text-slate-600 dark:text-slate-300">
                Search catalog
                <input
                    type="search"
                    className={className}
                    placeholder="Name, part number, material…"
                    value={filters.search}
                    onChange={(event) => update('search', event.target.value)}
                />
            </label>
            <div
                key={filterReset}
                className="flex shrink-0 gap-2 overflow-x-auto pb-1"
                aria-label="Catalog parameter filters"
            >
                <CatalogFilterColumn
                    title="Tool type"
                    value={filters.type === 'all' ? '' : filters.type}
                    onChange={(value) => update('type', value || 'all')}
                    options={[
                        { value: 'flat', label: 'Flat' },
                        { value: 'ball', label: 'Ball' },
                        { value: 'ballnose', label: 'Ball nose' },
                        { value: 'surfacing', label: 'Surfacing' },
                        { value: 'drill', label: 'Drill' },
                        { value: 'v-bit', label: 'V-bit' },
                        { value: 'specialty', label: 'Specialty' },
                    ]}
                />
                <CatalogFilterColumn
                    title={`Shank diameter (${lengthUnit(units)})`}
                    value={filters.shank}
                    onChange={(value) => update('shank', value)}
                    options={values('shankDiameterMm').map((value) => ({
                        value: String(value),
                        label: String(displayValue(value, units, 4)),
                    }))}
                />
                <CatalogFilterColumn
                    title="Flute count"
                    value={filters.flutes}
                    onChange={(value) => update('flutes', value)}
                    options={values('flutes').map((value) => ({
                        value: String(value),
                        label: String(value),
                    }))}
                />
                <CatalogFilterColumn
                    title="V-bit angle (°)"
                    value={filters.angle}
                    onChange={(value) => update('angle', value)}
                    options={values('fluteAngleDeg').map((value) => ({
                        value: String(value),
                        label: `${value}°`,
                    }))}
                />
                {(
                    [
                        [
                            'Cutting diameter',
                            'cuttingDiameterMm',
                            'minDiameter',
                            'maxDiameter',
                        ],
                        [
                            'Cutting length',
                            'cuttingLengthMm',
                            'minLength',
                            'maxLength',
                        ],
                    ] as const
                ).map(([title, key, min, max]) => (
                    <CatalogFilterColumn
                        key={key}
                        title={`${title} (${lengthUnit(units)})`}
                        value={
                            filters[min] != null &&
                            filters[min] === filters[max]
                                ? String(filters[min])
                                : filters[min] != null || filters[max] != null
                                  ? 'range'
                                  : ''
                        }
                        onChange={(value) => {
                            const size = value === '' ? null : Number(value);
                            setFilters((current) => ({
                                ...current,
                                [min]: size,
                                [max]: size,
                            }));
                            setLengthDrafts({});
                        }}
                        options={values(key).map((value) => ({
                            value: String(value),
                            label: String(displayValue(value, units, 4)),
                        }))}
                    >
                        <div className="grid grid-cols-2 gap-1 px-2 pb-1">
                            {lengthField(min, `Min ${title.toLowerCase()}`)}
                            {lengthField(max, `Max ${title.toLowerCase()}`)}
                        </div>
                    </CatalogFilterColumn>
                ))}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span role="status">
                    {filteredCatalog.length} of {catalog.length} tools
                </span>
                <button
                    type="button"
                    className="rounded px-2 py-1 underline"
                    onClick={() => {
                        setFilters(EMPTY_CATALOG_FILTERS);
                        setLengthDrafts({});
                        setFilterReset((value) => value + 1);
                    }}
                >
                    Clear filters
                </button>
            </div>
            {!filteredCatalog.length && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    No matching tools. Clear filters or use the Custom tab.
                </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-300 dark:border-robin-900">
                <div className="min-w-[760px]">
                    <div
                        aria-hidden="true"
                        className="sticky top-0 z-10 grid grid-cols-[minmax(260px,1fr)_100px_80px_80px_60px_80px] gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-robin-950 dark:text-slate-200"
                    >
                        <span>Tool</span>
                        <span>Type</span>
                        <span>Diameter ({lengthUnit(units)})</span>
                        <span>Shank ({lengthUnit(units)})</span>
                        <span>Flutes</span>
                        <span>Length ({lengthUnit(units)})</span>
                    </div>
                    <div
                        role="radiogroup"
                        aria-label="Catalog tools"
                        className="divide-y divide-slate-200 dark:divide-robin-900"
                    >
                        {selected &&
                            !filteredCatalog.includes(selected) &&
                            renderToolRow(selected, true)}
                        {catalogGroups(filteredCatalog).flatMap((group) =>
                            group.tools.map((tool) => renderToolRow(tool)),
                        )}
                    </div>
                </div>
            </div>
            {catalogError && (
                <p className="text-xs text-red-500">{catalogError}</p>
            )}
            {selected?.storeUrl && (
                <a
                    href={selected.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-robin-400 hover:text-robin-300"
                >
                    <ExternalLink size={12} /> Store page
                </a>
            )}
        </div>
    );
}
