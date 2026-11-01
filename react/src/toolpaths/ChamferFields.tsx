import { UnitInput } from '../components/UnitInput';
import { edgeChamferDimensions } from '../cam/chamfer.js';
import { formatLength, lengthUnit, type UnitSystem } from '../lib/units';

export function ChamferFields({
    width,
    tipOffset,
    angle,
    diameter,
    units,
    onWidth,
    onTipOffset,
}: {
    width: number | null;
    tipOffset: number;
    angle: number;
    diameter: number;
    units: UnitSystem;
    onWidth(value: number): void;
    onTipOffset(value: number): void;
}) {
    if (width === null)
        return (
            <div className="space-y-2 text-xs">
                <p>
                    Legacy centreline chamfer: retains this job’s original depth
                    and path.
                </p>
                <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() => onWidth(0.5)}
                >
                    Use edge width
                </button>
            </div>
        );
    let depth: number | null = null;
    try {
        depth = edgeChamferDimensions(
            width,
            tipOffset,
            angle,
            diameter,
        ).cutDepth;
    } catch {
        /* The draft reports invalid cutting geometry. */
    }
    const field =
        'mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1 dark:border-robin-900 dark:bg-dark-lighter';
    return (
        <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
                <label>
                    Chamfer width ({lengthUnit(units)})
                    <UnitInput
                        aria-label="Chamfer width"
                        units={units}
                        valueMm={width}
                        minMm={0.01}
                        stepMm={0.1}
                        onChangeMm={onWidth}
                        className={field}
                    />
                </label>
                <label>
                    Tip offset ({lengthUnit(units)})
                    <UnitInput
                        aria-label="Chamfer tip offset"
                        units={units}
                        valueMm={tipOffset}
                        minMm={0}
                        stepMm={0.1}
                        onChangeMm={onTipOffset}
                        className={field}
                    />
                </label>
            </div>
            <p>
                Width across the top face. Tip offset extends below the bevel.
            </p>
            {depth !== null && <p>Tip depth: {formatLength(depth, units)}</p>}
            <p>
                Closed outlines only. Profile the edges first; assumes a pointed
                V-bit.
            </p>
        </div>
    );
}
