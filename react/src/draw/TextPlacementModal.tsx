/**
 * Purpose: Implementation module for TextPlacementModal in the draw domain.
 */
import { FontPicker } from './FontPicker';
import { FONT_OPTIONS } from './textGeometry';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { UnitInput } from '../components/UnitInput';

interface TextPlacementModalProps {
    units: UnitSystem;
    text: string;
    font: string;
    heightMm: number;
    onTextChange(value: string): void;
    onFontChange(value: string): void;
    onHeightChange(value: number): void;
    onClose(): void;
    onSubmit(): void | Promise<void>;
}

/** Modal editor for a pending canvas text anchor. */
export function TextPlacementModal({
    units,
    text,
    font,
    heightMm,
    onTextChange,
    onFontChange,
    onHeightChange,
    onClose,
    onSubmit,
}: TextPlacementModalProps) {
    const selectedFont = FONT_OPTIONS.find((option) => option.id === font);
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/50 p-4"
            onMouseDown={onClose}
        >
            <form
                className="relative grid w-full max-w-sm gap-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-900 shadow-xl dark:border-robin-900 dark:bg-dark dark:text-white"
                onMouseDown={(event) => event.stopPropagation()}
                onSubmit={async (event) => {
                    event.preventDefault();
                    await onSubmit();
                }}
            >
                <div className="text-base font-semibold">Add Text Shapes</div>
                <label className="grid gap-1">
                    <span>Text</span>
                    <input
                        autoFocus
                        value={text}
                        maxLength={40}
                        onChange={(event) => onTextChange(event.target.value)}
                        aria-label="Text to place"
                        style={{
                            fontFamily:
                                selectedFont?.kind === 'outline'
                                    ? `"${selectedFont.family}", sans-serif`
                                    : undefined,
                        }}
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                    />
                </label>
                <div className="grid gap-1">
                    <span>Font</span>
                    <FontPicker
                        value={font}
                        onChange={onFontChange}
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                    />
                </div>
                <label className="grid gap-1">
                    <span>Height ({lengthUnit(units)})</span>
                    <UnitInput
                        units={units}
                        minMm={1}
                        valueMm={heightMm}
                        onChangeMm={onHeightChange}
                        aria-label={`Text height in ${lengthUnit(units)}`}
                        className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                    />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-200 dark:border-robin-900 dark:hover:bg-dark-lighter"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="rounded bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800"
                    >
                        Add Text
                    </button>
                </div>
            </form>
        </div>
    );
}
