import { UnitInput } from '../components/UnitInput';
import type { UnitSystem } from '../lib/units';

export function SurfaceCamFields({
    operation,
    units,
    resolution,
    stepover,
    stepdown,
    allowance,
    boundary,
    boundaryMode,
    onBoundaryMode,
    onResolution,
    onStepover,
    onStepdown,
    onAllowance,
    onBoundary,
    hasModel,
    toolReady,
}: {
    operation: 'surface-clear' | 'surface-finish' | 'surface-waterline';
    units: UnitSystem;
    resolution: number;
    stepover: number;
    stepdown: number;
    allowance: number;
    boundary: number;
    boundaryMode: 'model' | 'rectangle';
    onBoundaryMode(value: 'model' | 'rectangle'): void;
    onResolution(value: number): void;
    onStepover(value: number): void;
    onStepdown(value: number): void;
    onAllowance(value: number): void;
    onBoundary(value: number): void;
    hasModel: boolean;
    toolReady: boolean;
}) {
    const clearing = operation === 'surface-clear';
    const waterline = operation === 'surface-waterline';
    return (
        <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-robin-900 dark:bg-dark-lighter">
            <h3 className="font-medium text-slate-800 dark:text-white">
                {clearing
                    ? '3D rough clearing'
                    : waterline
                      ? '3D waterline finishing'
                      : '3D surface finishing'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {clearing
                    ? 'Uses a flat-bottom end mill to remove most material. Leave a little stock for the finishing pass.'
                    : waterline
                      ? 'Uses a ball end mill to finish steep sides with level contour passes.'
                      : 'Uses a ball end mill to follow the model surface and smooth the shape.'}
            </p>
            {!hasModel && (
                <p className="text-xs text-red-600 dark:text-red-300">
                    Select a placed 3D model or image heightmap.
                </p>
            )}
            {hasModel && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    This is a top-down 3-axis cut: surfaces hidden underneath
                    overhangs cannot be reached and are not machined.
                </p>
            )}
            {!toolReady && (
                <p className="text-xs text-red-600 dark:text-red-300">
                    Choose a flat end mill for rough clearing or a ball end mill
                    for finishing in your tool library.
                </p>
            )}
            <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>
                    Machining detail ({units === 'imperial' ? 'in' : 'mm'})
                </span>
                <UnitInput
                    units={units}
                    minMm={0.05}
                    maxMm={2}
                    stepMm={0.05}
                    valueMm={resolution}
                    onChangeMm={onResolution}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                />
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Smaller values capture finer detail but take longer to
                    calculate.
                </span>
            </label>
            {!waterline && (
                <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span>Stepover ({units === 'imperial' ? 'in' : 'mm'})</span>
                    <UnitInput
                        units={units}
                        minMm={0.05}
                        stepMm={0.1}
                        valueMm={stepover}
                        onChangeMm={onStepover}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                    />
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Distance between passes; a smaller spacing gives a
                        smoother finish.
                    </span>
                </label>
            )}
            {!waterline && stepover < resolution && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    Set grid resolution to at most the stepover to achieve the
                    requested pass spacing.
                </p>
            )}
            {(clearing || waterline) && (
                <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span>
                        {waterline ? 'Z level spacing' : 'Stepdown'} (
                        {units === 'imperial' ? 'in' : 'mm'})
                    </span>
                    <UnitInput
                        units={units}
                        minMm={0.05}
                        stepMm={0.1}
                        valueMm={stepdown}
                        onChangeMm={onStepdown}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                    />
                </label>
            )}
            {clearing && (
                <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span>
                        Stock to leave ({units === 'imperial' ? 'in' : 'mm'})
                    </span>
                    <UnitInput
                        units={units}
                        minMm={0}
                        stepMm={0.05}
                        valueMm={allowance}
                        onChangeMm={onAllowance}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                    />
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Material left for the finishing pass.
                    </span>
                </label>
            )}
            <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Machining boundary</span>
                <select
                    aria-label="Machining boundary"
                    value={boundaryMode}
                    onChange={(event) =>
                        onBoundaryMode(
                            event.target.value as 'model' | 'rectangle',
                        )
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                >
                    <option value="model">Follow model shape</option>
                    <option value="rectangle">Square off to rectangle</option>
                </select>
                {boundaryMode === 'rectangle' && (
                    <span className="block text-[11px] text-slate-500">
                        Machines the surrounding rectangle down to the model
                        base, leaving the model intact.
                    </span>
                )}
            </label>
            {(!waterline || boundaryMode === 'rectangle') && (
                <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span>
                        Boundary margin ({units === 'imperial' ? 'in' : 'mm'})
                    </span>
                    <UnitInput
                        units={units}
                        minMm={0}
                        stepMm={0.1}
                        valueMm={boundary}
                        onChangeMm={onBoundary}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark"
                    />
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {boundaryMode === 'rectangle'
                            ? 'Extra machining area around the model rectangle.'
                            : 'Extra distance the cutter travels past the model edge.'}
                        It must fit within the job stock.
                    </span>
                </label>
            )}
        </section>
    );
}
