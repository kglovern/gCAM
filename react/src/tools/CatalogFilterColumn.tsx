import { useState, type ReactNode } from 'react';

export function CatalogFilterColumn({
    title,
    options,
    value,
    onChange,
    children,
}: {
    title: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    children?: ReactNode;
}) {
    const [search, setSearch] = useState('');
    const visible = options.filter((option) =>
        option.label.toLowerCase().includes(search.trim().toLowerCase()),
    );
    return (
        <fieldset className="flex h-[clamp(140px,24dvh,192px)] min-w-40 flex-1 flex-col overflow-hidden rounded border border-slate-300 dark:border-robin-900">
            <legend className="sr-only">{title}</legend>
            <div className="bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:bg-robin-950 dark:text-slate-200">
                {title}
            </div>
            <input
                type="search"
                aria-label={`Search ${title}`}
                placeholder="Search filter…"
                className="m-1.5 min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-robin-900 dark:bg-slate-900 dark:text-slate-100"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />
            {children}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1.5">
                <label className="flex cursor-pointer items-center gap-1.5 py-1 text-xs text-slate-700 dark:text-slate-200">
                    <input
                        type="radio"
                        name={title}
                        checked={value === ''}
                        onChange={() => onChange('')}
                    />
                    Any
                </label>
                {visible.map((option) => (
                    <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-1.5 py-1 text-xs text-slate-700 dark:text-slate-200"
                    >
                        <input
                            type="radio"
                            name={title}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                        />
                        {option.label}
                    </label>
                ))}
                {!visible.length && (
                    <p className="py-1 text-xs text-slate-500">
                        No matching values
                    </p>
                )}
            </div>
        </fieldset>
    );
}
