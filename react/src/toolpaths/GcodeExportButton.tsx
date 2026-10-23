import { SendToGsenderButton } from '../integrations/gsender/SendToGsenderButton';
import { downloadGcode } from './exportGcode';
import { ChevronDown, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { combineToolpaths } from '../lib/engine';
import { gcodeForUnits, type UnitSystem } from '../lib/units';
import type { ToolpathStackEntry } from './useToolpathStack';

export function GcodeExportButton({
    gcode,
    fileName,
    stack,
    units,
    emitArcs,
    programs,
}: {
    gcode: string;
    fileName: string;
    stack: ToolpathStackEntry[];
    units: UnitSystem;
    emitArcs: boolean;
    programs?: { id: string; label: string; gcode: string }[];
}) {
    const [open, setOpen] = useState(false);
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
                  ),
          }))
        : stack.map((entry, index) => ({
              id: entry.id,
              label: entry.label,
              download: () => {
                  const name = `${baseName}-${index + 1}-${entry.label.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\.+$/g, '') || 'toolpath'}`;
                  downloadGcode(
                      gcodeForUnits(
                          combineToolpaths([entry.toolpath], name, emitArcs),
                          units,
                      ),
                      name,
                  );
              },
          }));
    const buttonClass =
        'flex min-h-11 items-center justify-center bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
    return (
        <div ref={root} className="relative space-y-2">
            <div className="flex">
                <button
                    type="button"
                    disabled={!gcode.trim()}
                    onClick={() => downloadGcode(gcode, baseName)}
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
                    disabled={!items.length}
                    onClick={() => setOpen(!open)}
                    className={`${buttonClass} w-11 shrink-0 rounded-r-lg border-l border-emerald-400/50`}
                >
                    <ChevronDown size={16} />
                </button>
            </div>
            <SendToGsenderButton gcode={gcode} fileName={fileName} />
            {open && (
                <div className="absolute bottom-full z-30 mb-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-robin-900 dark:bg-dark">
                    <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                        Export individual toolpath
                    </p>
                    {items.map((entry, index) => (
                        <button
                            key={entry.id}
                            type="button"
                            className="block min-h-11 w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-dark-lighter"
                            onClick={() => {
                                entry.download();
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
