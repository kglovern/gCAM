/**
 * Purpose: Implementation module for ToolLibraryModal in the react domain.
 */
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { RotateCcw, Save, Layers, X } from 'lucide-react';
import cx from 'classnames';
import {
    blankSlots,
    isConfigured,
    loadSlots,
    saveSlots,
    type ToolSlot,
    type ToolType,
} from './library';
import { loadToolLibraries, type LibraryTool } from '../lib/library';
import { displayValue, lengthUnit, toMm, type UnitSystem } from '../lib/units';
import { REQUIRED_TOOL_FIELDS, rowHasAnyData, slotIssues } from './toolCatalog';
import { ToolCatalogSelect } from './ToolCatalogSelect';
import { ToolSlotRow } from './ToolSlotRow';

interface ToolLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSlotChange?: (slot: ToolSlot) => void;
    initialSlot?: number | null;
    units?: UnitSystem;
}

export function ToolLibraryModal({
    isOpen,
    onClose,
    onSlotChange,
    initialSlot = null,
    units = 'metric',
}: ToolLibraryModalProps) {
    const [slots, setSlots] = useState<ToolSlot[]>(() =>
        typeof window !== 'undefined'
            ? loadSlots(window.localStorage)
            : blankSlots(),
    );
    const [editingSlot, setEditingSlot] = useState<number | null>(null);
    const [catalog, setCatalog] = useState<LibraryTool[]>([]);
    const [catalogError, setCatalogError] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    useDialogFocus(modalRef, isOpen);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSlots(loadSlots(window.localStorage));
        }
        let cancelled = false;
        loadToolLibraries()
            .then((tools) => {
                if (!cancelled) setCatalog(tools);
            })
            .catch((e: unknown) => {
                if (!cancelled)
                    setCatalogError(
                        e instanceof Error ? e.message : 'Catalog load failed',
                    );
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isOpen) setEditingSlot(initialSlot);
    }, [isOpen, initialSlot]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const persist = (updated: ToolSlot[]) => {
        setSlots(updated);
        if (typeof window !== 'undefined') {
            saveSlots(window.localStorage, updated);
        }
    };

    const handleSave = (slotNum: number, data: Partial<ToolSlot>) => {
        const updated = slots.map((s) =>
            s.slot === slotNum ? { ...s, ...data } : s,
        );
        persist(updated);
        const saved = updated.find((s) => s.slot === slotNum);
        if (saved && onSlotChange) onSlotChange(saved);
        setEditingSlot(null);
    };

    const handleClear = (slotNum: number) => {
        const updated = slots.map((s) =>
            s.slot === slotNum ? { ...blankSlots()[slotNum - 1] } : s,
        );
        persist(updated);
        const cleared = updated.find((s) => s.slot === slotNum);
        if (cleared && onSlotChange) onSlotChange(cleared);
        setEditingSlot(null);
    };

    const handleResetAll = () => {
        persist(blankSlots());
        setEditingSlot(null);
    };

    // First blocking issue across partially-filled rows (camcanvas parity).
    const firstIssue = slots.flatMap((s) =>
        rowHasAnyData(s) && !isConfigured(s)
            ? [`T${s.slot}: ${slotIssues(s).join(', ')}`]
            : [],
    )[0];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-library-title"
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className={cx(
                    'w-full max-w-3xl max-h-[calc(var(--app-height,100dvh)-16px)] md:max-h-[90dvh] flex flex-col overflow-hidden',
                    'rounded-lg bg-gray-100 dark:bg-dark border border-gray-300 dark:border-gray-700',
                    'animate-slide-up',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2 md:px-5 md:py-4 border-b border-slate-200 bg-gray-100 dark:border-robin-900 dark:bg-dark">
                    <h2
                        id="tool-library-title"
                        className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
                    >
                        <Layers size={20} className="text-robin-400" />
                        Tool Library
                    </h2>
                    <button
                        onClick={onClose}
                        className={cx(
                            'p-2 rounded-lg transition-colors',
                            'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50',
                        )}
                        aria-label="Close tool library"
                    >
                        <X size={20} />
                    </button>
                </header>

                <div
                    className={`min-h-0 flex-1 p-3 md:p-4 ${editingSlot === null ? 'overflow-y-auto overscroll-contain space-y-3' : 'flex flex-col overflow-hidden'}`}
                >
                    {slots
                        .filter(
                            (slot) =>
                                editingSlot === null ||
                                editingSlot === slot.slot,
                        )
                        .map((slot) =>
                            editingSlot === slot.slot ? (
                                <ToolSlotEditor
                                    key={slot.slot}
                                    slot={slot}
                                    catalog={catalog}
                                    catalogError={catalogError}
                                    units={units}
                                    onSave={(data) =>
                                        handleSave(slot.slot, data)
                                    }
                                    onCancel={() => setEditingSlot(null)}
                                />
                            ) : (
                                <ToolSlotRow
                                    key={slot.slot}
                                    slot={slot}
                                    units={units}
                                    onEdit={() => setEditingSlot(slot.slot)}
                                    onClear={() => handleClear(slot.slot)}
                                />
                            ),
                        )}
                </div>

                {editingSlot === null && (
                    <footer className="shrink-0 bg-gray-100 px-4 py-3 border-t border-slate-200 dark:border-robin-900 dark:bg-dark flex items-center gap-3">
                        {firstIssue && (
                            <span
                                role="alert"
                                className="w-full text-xs text-red-500"
                            >
                                {firstIssue}
                            </span>
                        )}
                        <span className="flex-1" />
                        <button
                            onClick={handleResetAll}
                            className={cx(
                                'flex items-center gap-2 px-4 py-2 rounded-lg',
                                'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50',
                                'transition-colors text-sm font-medium',
                            )}
                        >
                            <RotateCcw size={16} />
                            Reset All
                        </button>
                        <button
                            onClick={onClose}
                            className={cx(
                                'flex items-center gap-2 px-5 py-2 rounded-lg',
                                'bg-robin-500 hover:bg-robin-600 text-white',
                                'transition-colors text-sm font-medium',
                            )}
                        >
                            <Save size={16} />
                            Done
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
}

function ToolSlotEditor({
    slot,
    catalog,
    catalogError,
    units,
    onSave,
    onCancel,
}: {
    slot: ToolSlot;
    catalog: LibraryTool[];
    catalogError: string;
    units: UnitSystem;
    onSave: (data: Partial<ToolSlot>) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(slot.name);
    const [toolType, setToolType] = useState<ToolType>(slot.toolType);
    const [libraryToolId, setLibraryToolId] = useState(
        slot.libraryToolId ?? '',
    );
    const [diameter, setDiameter] = useState(
        slot.cuttingDiameterMm?.toString() ?? '',
    );
    const [angle, setAngle] = useState(slot.fluteAngleDeg?.toString() ?? '');
    const [flutes, setFlutes] = useState(slot.flutes?.toString() ?? '');
    const [cuttingLength, setCuttingLength] = useState(
        slot.cuttingLengthMm?.toString() ?? '',
    );
    const [touched, setTouched] = useState(false);

    const num = (v: string) => {
        const n = Number.parseFloat(v);
        return v.trim() !== '' && Number.isFinite(n) ? n : null;
    };
    const displayLength = (v: string) => {
        const n = num(v);
        return n == null ? '' : displayValue(n, units);
    };
    const draft: ToolSlot = {
        ...slot,
        name,
        toolType,
        libraryToolId: libraryToolId || null,
        cuttingDiameterMm: num(diameter),
        cuttingLengthMm: num(cuttingLength),
        flutes: num(flutes),
        cutterMaterial: slot.cutterMaterial,
        fluteAngleDeg: num(angle),
    };
    const issues = rowHasAnyData(draft) ? slotIssues(draft) : [];
    const invalid = (field: string) =>
        touched && issues.includes(REQUIRED_TOOL_FIELDS[field]);
    const valid = issues.length === 0;

    const fieldCls = (bad: boolean) =>
        cx(
            'w-full px-3 py-2.5 rounded-lg border text-sm',
            'bg-white dark:bg-dark border-slate-300 dark:border-robin-900 text-slate-900 dark:text-white',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-robin-500/50',
            bad && 'border-red-500 ring-2 ring-red-500/40',
        );

    const applyCatalogTool = (id: string) => {
        setLibraryToolId(id);
        const tool = catalog.find((t) => t.id === id);
        if (!tool) return;
        setName(tool.name);
        setToolType(tool.toolType);
        if (tool.cuttingDiameterMm != null)
            setDiameter(String(tool.cuttingDiameterMm));
        if (tool.cuttingLengthMm != null)
            setCuttingLength(String(tool.cuttingLengthMm));
        if (tool.flutes != null) setFlutes(String(tool.flutes));
        if (tool.fluteAngleDeg != null) setAngle(String(tool.fluteAngleDeg));
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg border border-robin-500/50 bg-slate-100 dark:bg-dark-lighter p-3 animate-slide-up">
            <header className="flex shrink-0 items-center justify-between">
                <span className="font-mono text-robin-400">
                    Editing T{slot.slot}
                </span>
                <button
                    onClick={onCancel}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-robin-900/50 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    aria-label="Cancel editing"
                >
                    <X size={18} />
                </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
                <ToolCatalogSelect
                    catalog={catalog}
                    catalogError={catalogError}
                    selectedId={libraryToolId}
                    units={units}
                    className={fieldCls(false)}
                    onSelect={applyCatalogTool}
                />

                <div className="grid grid-cols-2 gap-3">
                    <label className="col-span-2 space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Tool Name *
                        </span>
                        <input
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setTouched(true);
                            }}
                            placeholder='e.g. 1/4" End Mill'
                            aria-invalid={invalid('name')}
                            className={fieldCls(invalid('name'))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Type
                        </span>
                        <select
                            value={toolType}
                            onChange={(e) => {
                                setToolType(e.target.value as ToolType);
                                setTouched(true);
                            }}
                            className={fieldCls(false)}
                        >
                            <option value="flat">Flat</option>
                            <option value="ball">Ball</option>
                            <option value="ballnose">Ball Nose</option>
                            <option value="surfacing">Surfacing</option>
                            <option value="drill">Drill</option>
                            <option value="v-bit">V-Bit</option>
                            <option value="specialty">Specialty</option>
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Diameter ({lengthUnit(units)}) *
                        </span>
                        <input
                            type="number"
                            step={displayValue(0.1, units)}
                            min={displayValue(0.1, units)}
                            value={displayLength(diameter)}
                            onChange={(e) => {
                                setDiameter(
                                    e.target.value === ''
                                        ? ''
                                        : String(
                                              toMm(
                                                  Number(e.target.value),
                                                  units,
                                              ),
                                          ),
                                );
                                setTouched(true);
                            }}
                            aria-invalid={invalid('cuttingDiameterMm')}
                            className={fieldCls(invalid('cuttingDiameterMm'))}
                        />
                    </label>
                    {toolType === 'v-bit' && (
                        <label className="space-y-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                V Angle (°) *
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={179}
                                value={angle}
                                onChange={(e) => {
                                    setAngle(e.target.value);
                                    setTouched(true);
                                }}
                                aria-invalid={invalid('fluteAngleDeg')}
                                className={fieldCls(invalid('fluteAngleDeg'))}
                            />
                        </label>
                    )}
                    <label className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Flutes *
                        </span>
                        <input
                            type="number"
                            min={1}
                            max={12}
                            value={flutes}
                            onChange={(e) => {
                                setFlutes(e.target.value);
                                setTouched(true);
                            }}
                            aria-invalid={invalid('flutes')}
                            className={fieldCls(invalid('flutes'))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Cutting length ({lengthUnit(units)})
                        </span>
                        <input
                            type="number"
                            min={0}
                            step={displayValue(0.1, units)}
                            value={displayLength(cuttingLength)}
                            onChange={(e) => {
                                setCuttingLength(
                                    e.target.value === ''
                                        ? ''
                                        : String(
                                              toMm(
                                                  Number(e.target.value),
                                                  units,
                                              ),
                                          ),
                                );
                                setTouched(true);
                            }}
                            className={fieldCls(false)}
                        />
                    </label>
                </div>
            </div>
            <footer className="flex shrink-0 flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-robin-900">
                {issues.length > 0 && (
                    <span role="alert" className="w-full text-xs text-red-500">
                        Missing: {issues.join(', ')}
                    </span>
                )}
                <span className="flex-1" />
                <button
                    onClick={onCancel}
                    className={cx(
                        'px-4 py-2 rounded-lg',
                        'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-robin-900/50',
                        'transition-colors text-sm font-medium',
                    )}
                >
                    Cancel
                </button>
                <button
                    onClick={() => {
                        const tool = catalog.find(
                            (t) => t.id === libraryToolId,
                        );
                        onSave({
                            name: name.trim(),
                            toolType,
                            libraryToolId: libraryToolId || null,
                            vendor: tool?.vendor ?? '',
                            vendorDisplayName: tool?.vendorDisplayName ?? '',
                            storeUrl: tool?.storeUrl ?? '',
                            image: tool?.image ?? '',
                            cuttingDiameterMm: num(diameter),
                            cuttingLengthMm: num(cuttingLength),
                            flutes: num(flutes),
                            cutterMaterial: tool?.cutterMaterial ?? '',
                            fluteAngleDeg: num(angle),
                        });
                    }}
                    disabled={!valid}
                    title={valid ? undefined : issues.join(' | ')}
                    className={cx(
                        'flex items-center gap-2 px-5 py-2 rounded-lg',
                        'bg-robin-500 hover:bg-robin-600 text-white',
                        'transition-colors text-sm font-medium',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                >
                    <Save size={16} />
                    Save Tool
                </button>
            </footer>
        </div>
    );
}
