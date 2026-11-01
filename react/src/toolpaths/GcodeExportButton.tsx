import type { LaserRotarySetup } from '../cam/laser-rotary.js';
import { SendToGsenderButton } from '../integrations/gsender/SendToGsenderButton';
import { SendToTabletButton } from '../integrations/pendant/SendToTabletButton';
import { downloadGcode } from './exportGcode';
import { ChevronDown, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { UnitSystem } from '../lib/units';
import type { ToolpathStackEntry } from './useToolpathStack';
import { exportToolpaths } from '../gcode/exportToolpaths';
import { exportProgramInWorker } from '../engine/cam-worker-client';
import { laserExportPayload } from '../gcode/laserExportPayload';
import {
    DEFAULT_OUTPUT,
    outputError,
    type OutputSettings,
} from '../gcode/profiles';

export function GcodeExportButton({
    outputSettings = DEFAULT_OUTPUT,
    gcode,
    fileName,
    stack,
    units,
    emitArcs,
    programs,
    laserRotary,
    validateEntry,
}: {
    outputSettings?: OutputSettings;
    validateEntry?: (entry: ToolpathStackEntry) => string;
    gcode: string;
    fileName: string;
    stack: ToolpathStackEntry[];
    units: UnitSystem;
    emitArcs: boolean;
    laserRotary?: LaserRotarySetup;
    programs?: { id: string; label: string; gcode: string }[];
}) {
    const validationRef = useRef(validateEntry);
    validationRef.current = validateEntry;
    const mounted = useRef(true),
        cancelExport = useRef<(() => void) | null>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            cancelExport.current?.();
        };
    }, []);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    const baseName = (fileName || 'gcam').replace(/\.[^.]+$/, '');
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !root.current?.contains(event.target)
            )
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);
    const items = programs
        ? programs.map((program, index) => ({
              id: program.id,
              label: program.label,
              download: () =>
                  downloadGcode(
                      program.gcode,
                      `${baseName}-${index + 1}-${program.label}`,
                      outputSettings.extension,
                  ),
          }))
        : stack
              .filter((entry) => entry.outputEnabled !== false)
              .map((entry, index) => ({
                  id: entry.id,
                  label: entry.label,
                  download: async () => {
                      const name = `${baseName}-${index + 1}-${entry.label.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\.+$/g, '') || 'toolpath'}`;
                      const initialError = validationRef.current?.(entry);
                      if (initialError) throw new Error(initialError);
                      let code: string;
                      if (
                          typeof Worker !== 'undefined' &&
                          String(entry.args.operation).startsWith('laser-')
                      ) {
                          const job = exportProgramInWorker({
                              toolpaths: laserExportPayload([
                                  { ...entry.toolpath, laserRotary },
                              ]),
                              fileName: name,
                              arcs: emitArcs,
                              units,
                              settings: outputSettings,
                          });
                          cancelExport.current = job.cancel;
                          try {
                              code = await job.promise;
                          } finally {
                              cancelExport.current = null;
                          }
                      } else
                          code = exportToolpaths(
                              [
                                  String(entry.args.operation).startsWith(
                                      'laser-',
                                  )
                                      ? { ...entry.toolpath, laserRotary }
                                      : entry.toolpath,
                              ],
                              name,
                              emitArcs,
                              units,
                              outputSettings,
                          );
                      if (!mounted.current)
                          throw new DOMException(
                              'Export cancelled.',
                              'AbortError',
                          );
                      const latestError = validationRef.current?.(entry);
                      if (latestError) throw new Error(latestError);
                      downloadGcode(code, name, outputSettings.extension);
                  },
              }));
    const buttonClass =
        'flex min-h-11 items-center justify-center bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
    return (
        <div ref={root} className="relative space-y-2">
            {busy && (
                <p role="status" className="text-xs text-slate-500">
                    Preparing download…
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                >
                    {error}
                </p>
            )}
            <div className="flex">
                <button
                    type="button"
                    disabled={busy || !gcode.trim()}
                    onClick={() =>
                        downloadGcode(gcode, baseName, outputSettings.extension)
                    }
                    className={`${buttonClass} flex-1 gap-2 rounded-l-lg px-3 py-2`}
                >
                    <Download size={16} />
                    Export G-code
                </button>
                <button
                    ref={toggle}
                    type="button"
                    aria-label="Export individual toolpaths"
                    aria-expanded={open}
                    disabled={busy || !items.length}
                    onClick={() => setOpen(!open)}
                    className={`${buttonClass} w-11 shrink-0 rounded-r-lg border-l border-emerald-400/50`}
                >
                    <ChevronDown size={16} />
                </button>
            </div>
            <SendToGsenderButton
                gcode={gcode}
                fileName={fileName}
                extension={outputSettings.extension}
                controller={outputSettings.controller}
            />
            <SendToTabletButton
                gcode={gcode}
                fileName={fileName}
                extension={outputSettings.extension}
                controller={outputSettings.controller}
            />
            {open && (
                <div className="absolute bottom-full z-30 mb-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-robin-900 dark:bg-dark">
                    <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                        Export individual toolpath
                    </p>
                    {items.map((entry, index) => (
                        <button
                            key={entry.id}
                            type="button"
                            disabled={busy}
                            className="block min-h-11 w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-dark-lighter"
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await entry.download();
                                    setError('');
                                } catch (cause) {
                                    setError(outputError(cause));
                                } finally {
                                    setBusy(false);
                                }
                                setOpen(false);
                                toggle.current?.focus();
                            }}
                        >
                            {index + 1}. {entry.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
