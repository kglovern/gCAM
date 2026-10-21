/**
 * Purpose: Implementation module for ConfigPanel in the components domain.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
    Box,
    Grid,
    Layers,
    Lightbulb,
    Ruler,
    Send,
    Settings,
} from 'lucide-react';
import cx from 'classnames';
import { displayValue, lengthUnit, toMm, type UnitSystem } from '../lib/units';
import { UnitInput } from './UnitInput';
import { PwaSettings } from '../pwa/PwaSettings';
import {
    CUSTOM_MACHINE_PROFILE_ID,
    MACHINE_PROFILES,
    machineProfileById,
} from '../cutting-parameters/machines';
import {
    EMPTY_MACHINE_TRAVEL_LIMITS,
    normalizeMachineTravelLimits,
    type MachineTravelLimits,
} from '../cutting-parameters/types';
import { pingGsender } from '../integrations/gsender/gsenderClient';
import {
    DEFAULT_GSENDER_PORT,
    isValidGsenderPort,
    loadGsenderPort,
    saveGsenderPort,
} from '../integrations/gsender/settings';

export type GridStyle = 'lines' | 'dots';

export interface GridState {
    visible: boolean;
    spacingMm: number;
    snap: boolean;
    style: GridStyle;
}

const GRID_STORAGE_KEY = 'gcam.grid.v1';

export function loadGrid(): GridState {
    const fallback: GridState = {
        visible: true,
        spacingMm: 10,
        snap: true,
        style: 'lines',
    };
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = JSON.parse(
            window.localStorage.getItem(GRID_STORAGE_KEY) ?? 'null',
        );
        if (!raw || typeof raw !== 'object') return fallback;
        return {
            visible: typeof raw.visible === 'boolean' ? raw.visible : true,
            spacingMm:
                typeof raw.spacingMm === 'number' && raw.spacingMm >= 0.5
                    ? raw.spacingMm
                    : 10,
            snap: typeof raw.snap === 'boolean' ? raw.snap : true,
            style: raw.style === 'dots' ? 'dots' : 'lines',
        };
    } catch {
        return fallback;
    }
}

export function saveGrid(grid: GridState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(grid));
    } catch {
        /* storage unavailable — grid stays in memory */
    }
}

function machineTravelLimitsForProfile(profileId: string): MachineTravelLimits {
    const profile = machineProfileById(profileId);
    return profile
        ? {
              maxXTravelMm: profile.maxXTravelMm,
              maxYTravelMm: profile.maxYTravelMm,
              minZTravelMm: -profile.maxZTravelMm,
              maxZTravelMm: null,
          }
        : EMPTY_MACHINE_TRAVEL_LIMITS;
}

interface ConfigPanelProps {
    darkMode: boolean;
    onDarkModeChange: (v: boolean) => void;
    grid: GridState;
    onGridChange: (g: GridState) => void;
    emitArcs: boolean;
    onEmitArcsChange: (v: boolean) => void;
    units: UnitSystem;
    onUnitsChange: (units: UnitSystem) => void;
    machineProfileId: string;
    onMachineProfileChange: (id: string) => void;
    machineTravelLimits: MachineTravelLimits;
    onMachineTravelLimitsChange: (limits: MachineTravelLimits) => void;
    onActionsChange?: (actions: ConfigActions | null) => void;
}

export interface ConfigActions {
    exportConfig: () => void;
    importConfig: () => void;
    resetConfig: () => void;
}

const inputCls = cx(
    'px-3 py-2.5 rounded-lg border text-right',
    'bg-white dark:bg-dark border-slate-300 dark:border-robin-900 text-slate-900 dark:text-white text-base',
    'focus:outline-none focus:ring-2 focus:ring-robin-500/50',
);

/**
 * Application preferences panel (gSender Config-tab equivalent).
 * All state is lifted to App so changes apply live to canvas + toolpaths.
 */
export function ConfigPanel({
    darkMode,
    onDarkModeChange,
    grid,
    onGridChange,
    emitArcs,
    onEmitArcsChange,
    units,
    onUnitsChange,
    machineProfileId,
    onMachineProfileChange,
    machineTravelLimits,
    onMachineTravelLimitsChange,
    onActionsChange,
}: ConfigPanelProps) {
    const importInputRef = useRef<HTMLInputElement>(null);
    const [toastTimeout, setToastTimeout] = useState(() => {
        if (typeof window === 'undefined') return 3000;
        return Number.parseInt(
            localStorage.getItem('gcam.toastTimeout') ?? '3000',
            10,
        );
    });
    const [status, setStatus] = useState('');
    const [gsenderPort, setGsenderPort] = useState(loadGsenderPort);
    const [gsenderPortDraft, setGsenderPortDraft] = useState(
        String(gsenderPort),
    );
    const [gsenderCheck, setGsenderCheck] = useState('');

    useEffect(() => {
        localStorage.setItem('gcam.toastTimeout', String(toastTimeout));
    }, [toastTimeout]);
    useEffect(() => {
        saveGsenderPort(gsenderPort);
        setGsenderPortDraft(String(gsenderPort));
    }, [gsenderPort]);

    const testGsenderConnection = async () => {
        setGsenderCheck('Checking…');
        const result = await pingGsender(gsenderPort);
        setGsenderCheck(
            result.state === 'unreachable'
                ? 'Not reachable — is gSender open on this computer?'
                : result.state === 'disabled'
                  ? `gSender ${result.version} is refusing files from gCAM (see its settings)`
                  : result.state === 'busy'
                    ? `Connected to gSender ${result.version} (job running)`
                    : `Connected to gSender ${result.version}`,
        );
    };

    const flash = (msg: string) => {
        setStatus(msg);
        window.setTimeout(() => setStatus(''), 2000);
    };

    const handleExportConfig = () => {
        const config = {
            darkMode,
            grid,
            emitArcs,
            units,
            machineProfileId,
            machineTravelLimits,
            toastTimeout,
            gsenderPort,
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gcam-config.json';
        a.click();
        URL.revokeObjectURL(url);
        flash('Configuration exported');
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const config = JSON.parse(ev.target?.result as string);
                if (typeof config.darkMode === 'boolean')
                    onDarkModeChange(config.darkMode);
                if (config.grid) onGridChange(config.grid);
                if (typeof config.emitArcs === 'boolean')
                    onEmitArcsChange(config.emitArcs);
                if (config.units === 'metric' || config.units === 'imperial')
                    onUnitsChange(config.units);
                let importedMachineProfileId: string | null = null;
                if (
                    typeof config.machineProfileId === 'string' &&
                    (config.machineProfileId === CUSTOM_MACHINE_PROFILE_ID ||
                        machineProfileById(config.machineProfileId))
                ) {
                    importedMachineProfileId = config.machineProfileId;
                    onMachineProfileChange(config.machineProfileId);
                }
                if (
                    importedMachineProfileId &&
                    importedMachineProfileId !== CUSTOM_MACHINE_PROFILE_ID
                ) {
                    onMachineTravelLimitsChange(
                        machineTravelLimitsForProfile(importedMachineProfileId),
                    );
                } else if (config.machineTravelLimits) {
                    onMachineTravelLimitsChange(
                        normalizeMachineTravelLimits(
                            config.machineTravelLimits,
                        ),
                    );
                }
                if (typeof config.toastTimeout === 'number')
                    setToastTimeout(config.toastTimeout);
                if (isValidGsenderPort(config.gsenderPort))
                    setGsenderPort(config.gsenderPort);
                flash('Configuration imported');
            } catch {
                flash('Failed to import configuration');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleResetConfig = () => {
        onDarkModeChange(true);
        onGridChange({
            visible: true,
            spacingMm: 10,
            snap: true,
            style: grid.style,
        });
        onEmitArcsChange(true);
        onUnitsChange('metric');
        onMachineProfileChange('longmill-router');
        onMachineTravelLimitsChange(
            machineTravelLimitsForProfile('longmill-router'),
        );
        setToastTimeout(3000);
        setGsenderPort(DEFAULT_GSENDER_PORT);
        flash('Configuration reset to defaults');
    };

    useEffect(() => {
        onActionsChange?.({
            exportConfig: handleExportConfig,
            importConfig: () => importInputRef.current?.click(),
            resetConfig: handleResetConfig,
        });
    }, [
        darkMode,
        emitArcs,
        grid,
        machineProfileId,
        machineTravelLimits,
        onActionsChange,
        onMachineProfileChange,
        onMachineTravelLimitsChange,
        toastTimeout,
        gsenderPort,
        units,
    ]);

    return (
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6 bg-slate-100 dark:bg-slate-800">
            <header className="border-b border-slate-300 dark:border-robin-900 pb-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings size={22} className="text-robin-400" />
                    Configuration
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Application preferences and defaults
                </p>
            </header>

            <PwaSettings />
            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Box size={16} className="text-robin-400" />
                    Machine
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Machine"
                        description="Machine profile sets travel and spindle limits for cutting recommendations"
                    >
                        <select
                            value={machineProfileId}
                            onChange={(event) => {
                                const id = event.target.value;
                                onMachineProfileChange(id);
                                if (machineProfileById(id)) {
                                    onMachineTravelLimitsChange(
                                        machineTravelLimitsForProfile(id),
                                    );
                                }
                            }}
                            className={cx(inputCls, 'max-w-[240px] text-left')}
                            aria-label="Machine profile"
                        >
                            {MACHINE_PROFILES.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.displayName}
                                </option>
                            ))}
                            <option value={CUSTOM_MACHINE_PROFILE_ID}>
                                Custom
                            </option>
                        </select>
                    </SettingRow>
                    {machineProfileId === CUSTOM_MACHINE_PROFILE_ID ? (
                        <div className="border-t border-slate-200 pt-3 dark:border-robin-900">
                            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                                Enter positive grblHAL maximum travel distances
                                in {lengthUnit(units)}. Machine coordinates
                                extend in the negative direction from home.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <TravelLimitInput
                                    label={`Max X (${lengthUnit(units)})`}
                                    value={machineTravelLimits.maxXTravelMm}
                                    units={units}
                                    minMm={0}
                                    onChange={(value) =>
                                        onMachineTravelLimitsChange({
                                            ...machineTravelLimits,
                                            maxXTravelMm:
                                                value !== null && value > 0
                                                    ? value
                                                    : null,
                                        })
                                    }
                                />
                                <TravelLimitInput
                                    label={`Max Y (${lengthUnit(units)})`}
                                    value={machineTravelLimits.maxYTravelMm}
                                    units={units}
                                    minMm={0}
                                    onChange={(value) =>
                                        onMachineTravelLimitsChange({
                                            ...machineTravelLimits,
                                            maxYTravelMm:
                                                value !== null && value > 0
                                                    ? value
                                                    : null,
                                        })
                                    }
                                />
                                <TravelLimitInput
                                    label={`Max Z (${lengthUnit(units)})`}
                                    value={
                                        machineTravelLimits.minZTravelMm ===
                                        null
                                            ? machineTravelLimits.maxZTravelMm
                                            : Math.abs(
                                                  machineTravelLimits.minZTravelMm,
                                              )
                                    }
                                    units={units}
                                    minMm={0}
                                    onChange={(value) =>
                                        onMachineTravelLimitsChange({
                                            ...machineTravelLimits,
                                            minZTravelMm:
                                                value !== null && value > 0
                                                    ? -value
                                                    : null,
                                            maxZTravelMm: null,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-robin-900 dark:text-slate-400">
                            Travel: X{' '}
                            {displayValue(
                                machineProfileById(machineProfileId)
                                    ?.maxXTravelMm ?? 0,
                                units,
                                1,
                            )}{' '}
                            × Y{' '}
                            {displayValue(
                                machineProfileById(machineProfileId)
                                    ?.maxYTravelMm ?? 0,
                                units,
                                1,
                            )}{' '}
                            × Z{' '}
                            {displayValue(
                                machineProfileById(machineProfileId)
                                    ?.maxZTravelMm ?? 0,
                                units,
                                1,
                            )}{' '}
                            {lengthUnit(units)}
                        </p>
                    )}
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Send size={16} className="text-robin-400" />
                    gSender
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Handoff Port"
                        description={`Local port gSender listens on for "Send to gSender" (default ${DEFAULT_GSENDER_PORT})`}
                    >
                        <input
                            type="number"
                            min={1024}
                            max={65535}
                            value={gsenderPortDraft}
                            onChange={(e) => {
                                setGsenderPortDraft(e.target.value);
                                const port = Number(e.target.value);
                                if (isValidGsenderPort(port))
                                    setGsenderPort(port);
                            }}
                            onBlur={() =>
                                setGsenderPortDraft(String(gsenderPort))
                            }
                            className={cx(inputCls, 'w-24')}
                            aria-label="gSender handoff port"
                        />
                    </SettingRow>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={testGsenderConnection}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark-lighter"
                        >
                            Test connection
                        </button>
                        {gsenderCheck && (
                            <span
                                role="status"
                                className="text-xs text-slate-500 dark:text-slate-400"
                            >
                                {gsenderCheck}
                            </span>
                        )}
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Lightbulb size={16} className="text-robin-400" />
                    Appearance
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Dark Mode"
                        description="Choose the theme that is easiest to see in your workspace"
                    >
                        <Toggle
                            label="Dark Mode"
                            checked={darkMode}
                            onChange={onDarkModeChange}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Ruler size={16} className="text-robin-400" />
                    Units
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Measurement System"
                        description="Convert displayed dimensions, feeds and generated G-code"
                    >
                        <div
                            className="flex rounded-lg border border-slate-300 dark:border-robin-900 overflow-hidden"
                            role="radiogroup"
                            aria-label="Measurement units"
                        >
                            <button
                                role="radio"
                                aria-checked={units === 'metric'}
                                onClick={() => onUnitsChange('metric')}
                                className={`px-3 py-2 text-sm touch-manipulation ${units === 'metric' ? 'bg-robin-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                            >
                                mm (Metric)
                            </button>
                            <button
                                role="radio"
                                aria-checked={units === 'imperial'}
                                onClick={() => onUnitsChange('imperial')}
                                className={`px-3 py-2 text-sm touch-manipulation ${units === 'imperial' ? 'bg-robin-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                            >
                                inch (Imperial)
                            </button>
                        </div>
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Grid size={16} className="text-robin-400" />
                    Canvas &amp; Grid
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Show Grid"
                        description="Display grid lines on canvas"
                    >
                        <Toggle
                            label="Show Grid"
                            checked={grid.visible}
                            onChange={(v) =>
                                onGridChange({ ...grid, visible: v })
                            }
                        />
                    </SettingRow>
                    <SettingRow
                        label="Snap to Grid"
                        description="Force drawing points to align with grid"
                    >
                        <Toggle
                            label="Snap to Grid"
                            checked={grid.snap}
                            onChange={(v) => onGridChange({ ...grid, snap: v })}
                            disabled={!grid.visible}
                        />
                    </SettingRow>
                    <SettingRow label="Grid Style" description="Lines or dots">
                        <div
                            className="flex rounded-lg border border-slate-300 dark:border-robin-900 overflow-hidden"
                            role="radiogroup"
                            aria-label="Grid style"
                        >
                            {(['lines', 'dots'] as const).map((style) => (
                                <button
                                    key={style}
                                    role="radio"
                                    aria-checked={grid.style === style}
                                    onClick={() =>
                                        onGridChange({ ...grid, style })
                                    }
                                    className={`px-3 py-2 text-sm capitalize touch-manipulation ${
                                        grid.style === style
                                            ? 'bg-robin-500 text-white'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                                    }`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={`Grid Spacing (${lengthUnit(units)})`}
                        description="Distance between grid lines"
                    >
                        <UnitInput
                            units={units}
                            minMm={0.5}
                            maxMm={100}
                            stepMm={0.5}
                            valueMm={grid.spacingMm}
                            onChangeMm={(valueMm) =>
                                onGridChange({
                                    ...grid,
                                    spacingMm: Math.max(0.5, valueMm || 0.5),
                                })
                            }
                            className={cx(inputCls, 'w-24')}
                            aria-label={`Grid spacing in ${lengthUnit(units)}`}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Layers size={16} className="text-robin-400" />
                    G-code Output
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Emit G2/G3 Arcs"
                        description="Default for new toolpaths (circular interpolation vs G1 segments)"
                    >
                        <Toggle
                            label="Emit G2/G3 Arcs"
                            checked={emitArcs}
                            onChange={onEmitArcsChange}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Box size={16} className="text-robin-400" />
                    Notifications
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Toast Duration (ms)"
                        description="How long status messages stay visible"
                    >
                        <input
                            type="number"
                            min={1000}
                            max={10000}
                            step={500}
                            value={toastTimeout}
                            onChange={(e) =>
                                setToastTimeout(
                                    Number.parseInt(e.target.value, 10) || 1000,
                                )
                            }
                            className={cx(inputCls, 'w-28')}
                            aria-label="Toast duration in ms"
                        />
                    </SettingRow>
                </div>
            </section>

            <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={handleImportConfig}
                className="hidden"
            />

            {status && (
                <div
                    role="status"
                    className="fixed bottom-4 right-4 bg-robin-500/90 text-slate-900 dark:text-white px-4 py-2 rounded-lg text-sm z-50"
                >
                    {status}
                </div>
            )}
        </div>
    );
}

function TravelLimitInput({
    label,
    value,
    units,
    minMm,
    maxMm,
    onChange,
}: {
    label: string;
    value: number | null;
    units: UnitSystem;
    minMm?: number;
    maxMm?: number;
    onChange(value: number | null): void;
}) {
    return (
        <label className="block text-xs text-slate-600 dark:text-slate-300">
            {label}
            <input
                type="number"
                min={minMm == null ? undefined : displayValue(minMm, units, 3)}
                max={maxMm == null ? undefined : displayValue(maxMm, units, 3)}
                step={displayValue(1, units, 3)}
                value={value === null ? '' : displayValue(value, units, 3)}
                onChange={(event) => {
                    if (!event.currentTarget.value) {
                        onChange(null);
                        return;
                    }
                    const display = Number(event.currentTarget.value);
                    if (Number.isFinite(display))
                        onChange(toMm(display, units));
                }}
                aria-label={label}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
            />
        </label>
    );
}

function SettingRow({
    label,
    description,
    children,
}: {
    label: string;
    description: string;
    children: React.ReactNode;
}) {
    const descriptionId = useId();
    return (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 min-h-[48px]">
            <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-white text-sm">
                    {label}
                </div>
                <p
                    id={descriptionId}
                    className="text-xs text-slate-500 dark:text-slate-400"
                >
                    {description}
                </p>
            </div>
            <div
                className="w-full min-w-0 sm:w-auto sm:flex-shrink-0 [&>select]:max-w-full"
                aria-describedby={descriptionId}
            >
                {children}
            </div>
        </div>
    );
}

function Toggle({
    checked,
    onChange,
    disabled,
    label,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={() => {
                if (!disabled) onChange(!checked);
            }}
            disabled={disabled}
            className={cx(
                'relative w-14 h-8 rounded-full transition-colors touch-manipulation',
                'focus:outline-none focus:ring-2 focus:ring-robin-500/50 focus:ring-offset-2 focus:ring-offset-white dark:ring-offset-dark',
                checked ? 'bg-robin-500' : 'bg-slate-700',
                disabled && 'opacity-50 cursor-not-allowed',
            )}
            aria-label={label}
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
        >
            <span
                className={cx(
                    'absolute top-1/2 -translate-y-1/2 left-1 w-6 h-6 rounded-full bg-white transition-transform shadow-lg',
                    checked ? 'translate-x-6' : 'translate-x-0',
                )}
            />
        </button>
    );
}
