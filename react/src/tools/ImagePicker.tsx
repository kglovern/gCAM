/**
 * Purpose: Accessible image-led picker used for catalog tools and tool-rack slots.
 */
import { Check, ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface ImagePickerOption {
    id: string;
    label: string;
    detail?: string;
    image?: string;
    disabled?: boolean;
}

export interface ImagePickerGroup {
    label?: string;
    options: ImagePickerOption[];
}

export function ImagePicker({
    ariaLabel,
    className,
    groups,
    placeholder,
    value,
    onChange,
    renderLabel,
}: {
    ariaLabel: string;
    className: string;
    groups: ImagePickerGroup[];
    placeholder: string;
    value: string;
    onChange: (id: string) => void;
    renderLabel?: (option: ImagePickerOption) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const options = groups.flatMap((group) => group.options);
    const selected = options.find((option) => option.id === value);

    useEffect(() => {
        const closeWhenOutside = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', closeWhenOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeWhenOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="listbox"
                onClick={() => setOpen((current) => !current)}
                className={`${className} flex items-center gap-2 text-start`}
            >
                {!renderLabel && <ToolImage image={selected?.image} alt="" />}
                <span
                    className="min-w-0 flex-1 whitespace-normal"
                    title={selected?.label}
                >
                    {selected
                        ? (renderLabel?.(selected) ?? selected.label)
                        : placeholder}
                </span>
                <ChevronDown size={16} className="shrink-0 opacity-70" />
            </button>
            {open && (
                <div
                    role="listbox"
                    aria-label={ariaLabel}
                    className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-300 bg-white p-1 shadow-xl dark:border-robin-800 dark:bg-dark-lighter"
                >
                    {groups.map((group) => (
                        <div key={group.label ?? 'options'}>
                            {group.label && (
                                <div className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {group.label}
                                </div>
                            )}
                            {group.options.map((option) => {
                                const active = option.id === value;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        disabled={option.disabled}
                                        onClick={() => {
                                            onChange(option.id);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-robin-900/50"
                                    >
                                        {!renderLabel && (
                                            <ToolImage
                                                image={option.image}
                                                alt=""
                                            />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block whitespace-normal text-sm text-slate-900 dark:text-white">
                                                {renderLabel?.(option) ??
                                                    option.label}
                                            </span>
                                            {option.detail && (
                                                <span className="block whitespace-normal text-xs text-slate-600 dark:text-slate-300">
                                                    {option.detail}
                                                </span>
                                            )}
                                        </span>
                                        {active && (
                                            <Check
                                                size={16}
                                                className="shrink-0 text-robin-500"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ToolImage({ image, alt }: { image?: string; alt: string }) {
    return image ? (
        <img
            src={image}
            alt={alt}
            className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain dark:border-robin-900 dark:bg-dark"
        />
    ) : (
        <span className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-slate-100 dark:border-robin-900 dark:bg-dark" />
    );
}
