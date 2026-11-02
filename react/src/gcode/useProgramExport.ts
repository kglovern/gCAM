import { useEffect, useMemo, useState } from 'react';
import { exportProgramInWorker } from '../engine/cam-worker-client';
import type { UnitSystem } from '../lib/units';
import { laserExportPayload } from './laserExportPayload';
import { exportToolpaths } from './exportToolpaths';
import { DEFAULT_OUTPUT, outputError, type OutputSettings } from './profiles';

export function useProgramExport(
    toolpaths: Record<string, unknown>[],
    fileName: string,
    arcs: boolean,
    units: UnitSystem,
    settings: OutputSettings = DEFAULT_OUTPUT,
) {
    const request = useMemo(
        () => ({ toolpaths, fileName, arcs, units, settings }),
        [toolpaths, fileName, arcs, units, settings],
    );
    const asynchronous =
        typeof Worker !== 'undefined' &&
        toolpaths.some((p) => String(p.operation).startsWith('laser-'));
    const synchronous = useMemo(() => {
        if (asynchronous) return { gcode: '', gcodeError: '' };
        try {
            return {
                gcode: exportToolpaths(
                    toolpaths,
                    fileName,
                    arcs,
                    units,
                    settings,
                ),
                gcodeError: '',
            };
        } catch (error) {
            return { gcode: '', gcodeError: outputError(error) };
        }
    }, [request, asynchronous]);
    const [completed, setCompleted] = useState<{
        request: typeof request;
        gcode: string;
        gcodeError: string;
    } | null>(null);
    useEffect(() => {
        if (!asynchronous) return;
        let active = true;
        let cancel: (() => void) | undefined;
        try {
            const pending = exportProgramInWorker({
                ...request,
                toolpaths: laserExportPayload(request.toolpaths),
            });
            cancel = pending.cancel;
            void pending.promise.then(
                (gcode) => {
                    if (active)
                        setCompleted({ request, gcode, gcodeError: '' });
                },
                (error: unknown) => {
                    if (active)
                        setCompleted({
                            request,
                            gcode: '',
                            gcodeError: outputError(error),
                        });
                },
            );
        } catch (error) {
            setCompleted({
                request,
                gcode: '',
                gcodeError: outputError(error),
            });
        }
        return () => {
            active = false;
            cancel?.();
        };
    }, [request, asynchronous]);
    if (!asynchronous) return { ...synchronous, gcodeBusy: false };
    if (completed?.request === request)
        return { ...completed, gcodeBusy: false };
    return { gcode: '', gcodeError: '', gcodeBusy: true };
}
