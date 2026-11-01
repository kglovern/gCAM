/**
 * Purpose: Implementation module for RasterLaserFields in the react domain.
 */
import type { Operation } from '../lib/engine';
import { UnitInput } from '../components/UnitInput';
import { lengthUnit, type UnitSystem } from '../lib/units';

interface RasterLaserFieldsProps {
    passThrough?: boolean;
    scanAngle?: number;
    nativePixelSize?: { x: number; y: number };
    operation: Operation;
    units: UnitSystem;
    laserFeed: number;
    onLaserFeedChange(value: number): void;
    laserPower: number;
    onLaserPowerChange(value: number): void;
    laserSpot: number;
    onLaserSpotChange(value: number): void;
    laserGamma: number;
    onLaserGammaChange(value: number): void;
    laserSMin: number;
    onLaserSMinChange(value: number): void;
    laserSMax: number;
    onLaserSMaxChange(value: number): void;
    laserOverscan: number;
    onLaserOverscanChange(value: number): void;
}

/** Laser-cut controls and raster-only power mapping controls. */
export function RasterLaserFields({
    operation,
    passThrough = false,
    scanAngle = 0,
    nativePixelSize,
    units,
    laserSpot,
    onLaserSpotChange,
    laserGamma,
    onLaserGammaChange,
    laserSMin,
    onLaserSMinChange,
    laserOverscan,
    onLaserOverscanChange,
}: RasterLaserFieldsProps) {
    const isLaser = operation.startsWith('laser-');
    if (!isLaser) return null;
    return (
        <>
            {operation === 'laser-raster' && (
                <div className="grid grid-cols-2 gap-2">
                    <NumberField
                        label="Resolution (DPI)"
                        value={
                            passThrough && nativePixelSize
                                ? Number(
                                      (
                                          25.4 /
                                          (Math.abs(
                                              Math.round(scanAngle / 90),
                                          ) % 2
                                              ? nativePixelSize.x
                                              : nativePixelSize.y)
                                      ).toFixed(2),
                                  )
                                : Math.round(25.4 / laserSpot)
                        }
                        disabled={passThrough}
                        min={1}
                        step={1}
                        onChange={(v) => {
                            if (v > 0) onLaserSpotChange(25.4 / v);
                        }}
                    />
                    <NumberField
                        label="Gamma"
                        disabled={passThrough}
                        value={laserGamma}
                        min={0.1}
                        step={0.1}
                        onChange={onLaserGammaChange}
                    />
                    <NumberField
                        label="Min power (%)"
                        value={laserSMin / 10}
                        min={0}
                        max={100}
                        onChange={(v) => onLaserSMinChange(v * 10)}
                    />
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Overscan ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={laserOverscan}
                            onChangeMm={onLaserOverscanChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
        </>
    );
}

function NumberField({
    label,
    disabled,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    disabled?: boolean;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange(value: number): void;
}) {
    return (
        <label className="space-y-1">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <input
                disabled={disabled}
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
            />
        </label>
    );
}
