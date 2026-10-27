/**
 * Purpose: React hook that owns the AppPreferences workflow.
 */
import { useEffect, useState } from 'react';
import type { ConfigActions } from '../components/ConfigPanel';
import { loadGrid, saveGrid } from '../components/ConfigPanel';
import type { SideTab } from '../components/Sidebar';
import { useDarkMode } from '../hooks/useDarkMode';
import type { UnitSystem } from '../lib/units';
import {
    EMPTY_MACHINE_TRAVEL_LIMITS,
    normalizeMachineTravelLimits,
    type MachineTravelLimits,
} from '../cutting-parameters/types';
import {
    DEFAULT_MACHINE_PROFILE,
    machineProfileById,
} from '../cutting-parameters/machines';

/** Persistent application-wide display and output preferences. */
export function useAppPreferences() {
    const [grid, setGrid] = useState(loadGrid);
    const [sideTab, setSideTab] = useState<SideTab>('toolpaths');
    const [configActions, setConfigActions] = useState<ConfigActions | null>(
        null,
    );
    const { enabled: darkMode, setEnabled: setDarkMode } = useDarkMode();
    const [emitArcs, setEmitArcs] = useState(() => {
        if (typeof window === 'undefined') return true;
        return JSON.parse(localStorage.getItem('gcam.emitArcs') ?? 'true');
    });
    const [units, setUnits] = useState<UnitSystem>(() => {
        if (typeof window === 'undefined') return 'metric';
        return localStorage.getItem('gcam.units') === 'imperial'
            ? 'imperial'
            : 'metric';
    });
    const [machineProfileId, setMachineProfileId] = useState(() => {
        if (typeof window === 'undefined') return DEFAULT_MACHINE_PROFILE.id;
        return (
            localStorage.getItem('gcam.machineProfileId') ??
            DEFAULT_MACHINE_PROFILE.id
        );
    });
    const [machineSetupOpen, setMachineSetupOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        const completed =
            localStorage.getItem('gcam.machineSetupComplete') === 'true';
        const hasExistingMachine =
            localStorage.getItem('gcam.machineProfileId') !== null;
        return !completed && !hasExistingMachine;
    });
    const [machineTravelLimits, setMachineTravelLimits] =
        useState<MachineTravelLimits>(() => {
            if (typeof window === 'undefined')
                return EMPTY_MACHINE_TRAVEL_LIMITS;
            try {
                const profileId =
                    localStorage.getItem('gcam.machineProfileId') ??
                    DEFAULT_MACHINE_PROFILE.id;
                const profile = machineProfileById(profileId);
                if (profile)
                    return {
                        maxXTravelMm: profile.maxXTravelMm,
                        maxYTravelMm: profile.maxYTravelMm,
                        minZTravelMm: -profile.maxZTravelMm,
                        maxZTravelMm: null,
                    };
                const saved = localStorage.getItem('gcam.machineTravelLimits');
                if (saved)
                    return normalizeMachineTravelLimits(JSON.parse(saved));
                return EMPTY_MACHINE_TRAVEL_LIMITS;
            } catch {
                return EMPTY_MACHINE_TRAVEL_LIMITS;
            }
        });

    useEffect(() => saveGrid(grid), [grid]);
    useEffect(
        () => localStorage.setItem('gcam.emitArcs', JSON.stringify(emitArcs)),
        [emitArcs],
    );
    useEffect(() => localStorage.setItem('gcam.units', units), [units]);
    useEffect(() => {
        if (!machineSetupOpen) {
            localStorage.setItem('gcam.machineProfileId', machineProfileId);
        }
    }, [machineProfileId, machineSetupOpen]);
    useEffect(() => {
        if (!machineSetupOpen) {
            localStorage.setItem('gcam.machineSetupComplete', 'true');
        }
    }, [machineSetupOpen]);
    useEffect(
        () =>
            localStorage.setItem(
                'gcam.machineTravelLimits',
                JSON.stringify(machineTravelLimits),
            ),
        [machineTravelLimits],
    );

    return {
        grid,
        setGrid,
        sideTab,
        setSideTab,
        configActions,
        setConfigActions,
        darkMode,
        setDarkMode,
        emitArcs,
        setEmitArcs,
        units,
        setUnits,
        machineProfileId,
        setMachineProfileId,
        machineSetupOpen,
        setMachineSetupOpen,
        machineTravelLimits,
        setMachineTravelLimits,
    };
}
