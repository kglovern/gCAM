/**
 * Purpose: Implementation module for TextureFields in the react domain.
 */
import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';

export function TextureFields({
    units,
    textureType,
    textureSpacing,
    crosshatchAngle,
    onTypeChange,
    onSpacingChange,
    onCrosshatchAngleChange,
}: {
    units: UnitSystem;
    textureType: 'voronoi' | 'crosshatch';
    textureSpacing: number;
    crosshatchAngle: number;
    onTypeChange: (type: 'voronoi' | 'crosshatch') => void;
    onSpacingChange: (spacing: number) => void;
    onCrosshatchAngleChange: (angle: number) => void;
}) {
    return (
        <div className="space-y-2">
            <label className="space-y-1 block">
                <span className="text-slate-500 dark:text-slate-400">
                    Texture type
                </span>
                <select
                    value={textureType}
                    onChange={(event) =>
                        onTypeChange(
                            event.target.value as 'voronoi' | 'crosshatch',
                        )
                    }
                    className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                >
                    <option value="voronoi">Voronoi</option>
                    <option value="crosshatch">Crosshatch</option>
                </select>
            </label>
            {textureType === 'voronoi' ? (
                <label className="space-y-1 block">
                    <span className="text-slate-500 dark:text-slate-400">
                        Approx. cell size ({lengthUnit(units)})
                    </span>
                    <UnitInput
                        units={units}
                        stepMm={0.5}
                        minMm={0.1}
                        valueMm={textureSpacing}
                        onChangeMm={onSpacingChange}
                        className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                    />
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Whole-area Voronoi cells, clipped to the selected
                        shapes.
                    </span>
                </label>
            ) : (
                <>
                    <label className="space-y-1 block">
                        <span className="text-slate-500 dark:text-slate-400">
                            Line spacing ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.5}
                            minMm={0.1}
                            valueMm={textureSpacing}
                            onChangeMm={onSpacingChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1 block">
                        <span className="text-slate-500 dark:text-slate-400">
                            First pass angle (°)
                        </span>
                        <input
                            type="number"
                            min="0"
                            max="180"
                            step="1"
                            value={crosshatchAngle}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value))
                                    onCrosshatchAngleChange(value);
                            }}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Two perpendicular V-bit passes, clipped to the selected
                        shapes.
                    </span>
                </>
            )}
        </div>
    );
}
