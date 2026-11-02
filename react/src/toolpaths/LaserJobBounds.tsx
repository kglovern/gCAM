import { useMemo, useState } from 'react';
import { laserJobBounds, type LaserBounds } from '../cam/laser-bounds';
import { jobStockBounds, type JobStock } from '../job/stock';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import type { MachineTravelLimits } from '../cutting-parameters/types';

export function LaserJobBoundsPanel({
    toolpaths,
    stock,
    units = 'metric',
    machineTravelLimits,
}: {
    toolpaths: Record<string, unknown>[];
    stock: JobStock;
    units?: UnitSystem;
    machineTravelLimits?: MachineTravelLimits;
}) {
    const [open, setOpen] = useState(false);
    const getResult = useMemo(() => {
        let cached:
            | {
                  bounds: ReturnType<typeof laserJobBounds> | null;
                  error: string;
              }
            | undefined;
        return (calculate: boolean) => {
            if (!cached && calculate) {
                try {
                    cached = { bounds: laserJobBounds(toolpaths), error: '' };
                } catch {
                    cached = {
                        bounds: null,
                        error: 'Could not calculate laser path bounds.',
                    };
                }
            }
            return cached;
        };
    }, [toolpaths]);
    const result = getResult(open);
    const { travel, powered } = result?.bounds ?? {
        travel: null,
        powered: null,
    };
    if (
        !toolpaths.some(
            (p) =>
                String(p.operation).startsWith('laser-') &&
                Array.isArray(p.laserPaths) &&
                p.laserPaths.some(
                    (path) =>
                        Array.isArray(path.points) && path.points.length > 1,
                ),
        )
    )
        return null;
    const material = jobStockBounds(stock);
    const outside =
        powered &&
        (powered.minX < material.minX - 1e-7 ||
            powered.minY < material.minY - 1e-7 ||
            powered.maxX > material.maxX + 1e-7 ||
            powered.maxY > material.maxY + 1e-7);
    const exceeds =
        travel &&
        (['X', 'Y'] as const).filter((axis) => {
            const limit =
                axis === 'X'
                    ? machineTravelLimits?.maxXTravelMm
                    : machineTravelLimits?.maxYTravelMm;
            return (
                limit != null &&
                (axis === 'X'
                    ? travel.maxX - travel.minX
                    : travel.maxY - travel.minY) >
                    limit + 1e-7
            );
        });
    const range = (lo: number, hi: number) =>
        `${displayValue(lo, units, 3)} … ${displayValue(hi, units, 3)}`;
    const row = (name: string, b: LaserBounds | null) => (
        <tr>
            <th className="pr-4 py-1 text-left font-medium">{name}</th>
            <td className="pr-4">{b ? range(b.minX, b.maxX) : '—'}</td>
            <td>{b ? range(b.minY, b.maxY) : '—'}</td>
        </tr>
    );
    return (
        <details
            className="shrink-0 rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-robin-900 dark:bg-dark dark:text-slate-200"
            aria-label="Laser path bounds"
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="cursor-pointer font-medium">
                Laser path bounds
                {outside || exceeds?.length ? ' · check clearance' : ''}
            </summary>
            {result?.error ? (
                <p role="alert">{result.error}</p>
            ) : result ? (
                <table className="mt-2 w-full">
                    <thead>
                        <tr>
                            <th className="text-left">
                                Centreline positions ({lengthUnit(units)})
                            </th>
                            <th className="text-left">X</th>
                            <th className="text-left">Y</th>
                        </tr>
                    </thead>
                    <tbody>
                        {row('Laser on', powered)}
                        {row('Head travel', travel)}
                    </tbody>
                </table>
            ) : null}
            {outside && (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                    Laser-on paths extend outside the stock.
                </p>
            )}
            {!!exceeds?.length && (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                    Head travel exceeds the configured {exceeds.join(' / ')}{' '}
                    travel span.
                </p>
            )}
            <p className="mt-1 text-slate-500 dark:text-slate-400">
                Travel includes overscan and leads. The sender checks work-zero
                clearance; custom start/end moves are not included.
            </p>
        </details>
    );
}
