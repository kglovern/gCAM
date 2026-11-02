import { useState } from 'react';
import { UnitInput } from '../components/UnitInput';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';
import { saveTextFile } from '../platform/saveTextFile';
import {
    exportLaserLibrary,
    importLaserLibrary,
    saveLaserRecipes,
    type LaserRecipe,
} from './laser-recipes';

export function LaserMaterialLibrary({
    recipes,
    units = 'metric',
    onChange,
    canApply,
    onApply,
}: {
    recipes: LaserRecipe[];
    units?: UnitSystem;
    onChange(recipes: LaserRecipe[]): void;
    canApply(recipe: LaserRecipe): boolean;
    onApply(recipe: LaserRecipe): void;
}) {
    const [message, setMessage] = useState('');
    const [query, setQuery] = useState('');
    const [renaming, setRenaming] = useState('');
    const [name, setName] = useState('');
    const [editing, setEditing] = useState<LaserRecipe | null>(null);
    const [removed, setRemoved] = useState<LaserRecipe | null>(null);
    function commit(next: LaserRecipe[]) {
        try {
            saveLaserRecipes(next);
            onChange(next);
            setMessage('');
            return true;
        } catch {
            setMessage('Could not save material library.');
            return false;
        }
    }
    return (
        <details className="rounded border border-slate-300 p-2 dark:border-robin-900">
            <summary className="cursor-pointer text-xs">
                Material library ({recipes.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                    type="button"
                    className="rounded border px-2 py-1"
                    disabled={!recipes.length}
                    onClick={() => {
                        try {
                            saveTextFile(
                                exportLaserLibrary(recipes),
                                'laser-materials.json',
                                'application/json',
                            );
                            setMessage('');
                        } catch (e) {
                            setMessage((e as Error).message);
                        }
                    }}
                >
                    Export library
                </button>
                <label className="cursor-pointer rounded border px-2 py-1">
                    Import library
                    <input
                        aria-label="Import laser material library"
                        type="file"
                        accept=".json,application/json"
                        className="sr-only"
                        onChange={async (event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (!file) return;
                            try {
                                if (file.size > 2 * 1024 * 1024)
                                    throw new Error(
                                        'Material library exceeds 2 MB.',
                                    );
                                const next = importLaserLibrary(
                                    await file.text(),
                                    recipes,
                                );
                                saveLaserRecipes(next);
                                onChange(next);
                                setMessage(
                                    `${next.length - recipes.length} settings imported. Existing entries kept.`,
                                );
                            } catch (e) {
                                setMessage((e as Error).message);
                            }
                        }}
                    />
                </label>
            </div>
            <input
                aria-label="Search laser materials"
                placeholder="Search material or setup"
                className="mt-2 w-full rounded border bg-transparent px-2 py-1 text-xs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <ul
                className={`mt-2 ${editing ? 'max-h-96' : 'max-h-40'} overflow-auto text-xs`}
            >
                {recipes
                    .filter((r) =>
                        `${r.name} ${r.material} ${r.laser} ${r.machine}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                    )
                    .map((r) => (
                        <li key={r.id} className="border-b py-1">
                            <span>{r.name}</span>
                            <span className="block text-slate-500">
                                {r.thicknessIndependent
                                    ? 'Any thickness'
                                    : `${displayValue(r.thickness, units)} ${lengthUnit(units)}`}
                            </span>
                            <span className="block text-slate-500">
                                {r.laser} · {displayFeed(r.feed, units)}{' '}
                                {feedUnit(units)} · {r.power / 10}%
                            </span>
                            {editing?.id === r.id ? (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {r.operation !== 'laser-cut' && (
                                        <label className="col-span-2 flex items-center gap-2">
                                            <input
                                                aria-label="Recipe any thickness"
                                                type="checkbox"
                                                checked={
                                                    editing.thicknessIndependent ??
                                                    false
                                                }
                                                onChange={(event) =>
                                                    setEditing({
                                                        ...editing,
                                                        thicknessIndependent:
                                                            event.currentTarget
                                                                .checked,
                                                    })
                                                }
                                            />
                                            Any thickness (surface engraving)
                                        </label>
                                    )}
                                    <label>
                                        Speed ({feedUnit(units)})
                                        <UnitInput
                                            aria-label="Recipe speed"
                                            units={units}
                                            kind="feed"
                                            className="w-full rounded border bg-transparent px-1"
                                            valueMm={editing.feed}
                                            onChangeMm={(feed) =>
                                                setEditing({ ...editing, feed })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Power (%)
                                        <input
                                            aria-label="Recipe power percent"
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="any"
                                            className="w-full rounded border bg-transparent px-1"
                                            value={editing.power / 10}
                                            onChange={(e) =>
                                                setEditing({
                                                    ...editing,
                                                    power:
                                                        Number(e.target.value) *
                                                        10,
                                                })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Passes
                                        <input
                                            aria-label="Recipe passes"
                                            type="number"
                                            min="1"
                                            max="100"
                                            step="1"
                                            className="w-full rounded border bg-transparent px-1"
                                            value={editing.options.passes ?? 1}
                                            onChange={(e) =>
                                                setEditing({
                                                    ...editing,
                                                    options: {
                                                        ...editing.options,
                                                        passes: Number(
                                                            e.target.value,
                                                        ),
                                                    },
                                                })
                                            }
                                        />
                                    </label>
                                    {r.operation !== 'laser-cut' && (
                                        <>
                                            <label>
                                                Interval ({lengthUnit(units)})
                                                <UnitInput
                                                    aria-label="Recipe interval"
                                                    units={units}
                                                    stepMm="any"
                                                    className="w-full rounded border bg-transparent px-1"
                                                    valueMm={editing.interval}
                                                    decimals={5}
                                                    onChangeMm={(interval) =>
                                                        setEditing({
                                                            ...editing,
                                                            interval,
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label>
                                                Overscan ({lengthUnit(units)})
                                                <UnitInput
                                                    aria-label="Recipe overscan"
                                                    units={units}
                                                    stepMm="any"
                                                    className="w-full rounded border bg-transparent px-1"
                                                    valueMm={
                                                        editing.overscan ?? 0
                                                    }
                                                    onChangeMm={(overscan) =>
                                                        setEditing({
                                                            ...editing,
                                                            overscan,
                                                        })
                                                    }
                                                />
                                            </label>
                                        </>
                                    )}
                                    <div className="col-span-2 flex gap-3">
                                        <button
                                            type="button"
                                            className="underline"
                                            onClick={() => {
                                                const next = {
                                                    ...editing,
                                                    source: 'User-edited settings',
                                                };
                                                try {
                                                    exportLaserLibrary([next]);
                                                    if (
                                                        commit(
                                                            recipes.map(
                                                                (item) =>
                                                                    item.id ===
                                                                    next.id
                                                                        ? next
                                                                        : item,
                                                            ),
                                                        )
                                                    )
                                                        setEditing(null);
                                                } catch (error) {
                                                    setMessage(
                                                        (error as Error)
                                                            .message,
                                                    );
                                                }
                                            }}
                                        >
                                            Save settings
                                        </button>
                                        <button
                                            type="button"
                                            className="underline"
                                            onClick={() => {
                                                setEditing(null);
                                                setMessage('');
                                            }}
                                        >
                                            Cancel edit
                                        </button>
                                    </div>
                                </div>
                            ) : renaming === r.id ? (
                                <div className="flex gap-1">
                                    <input
                                        aria-label="Material recipe name"
                                        className="min-w-0 flex-1 rounded border bg-transparent px-1"
                                        value={name}
                                        maxLength={200}
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        disabled={!name.trim()}
                                        onClick={() => {
                                            if (
                                                commit(
                                                    recipes.map((item) =>
                                                        item.id === r.id
                                                            ? {
                                                                  ...item,
                                                                  name: name.trim(),
                                                              }
                                                            : item,
                                                    ),
                                                )
                                            )
                                                setRenaming('');
                                        }}
                                    >
                                        Save name
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRenaming('')}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-1 flex gap-3">
                                    <button
                                        type="button"
                                        className="underline disabled:opacity-40"
                                        disabled={!canApply(r)}
                                        title="Requires matching laser setup, machine, material and operation within machine feed limits; thickness applies unless marked Any thickness"
                                        onClick={() => onApply(r)}
                                    >
                                        Use settings
                                    </button>
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => {
                                            setRenaming('');
                                            setEditing({
                                                ...r,
                                                options: { ...r.options },
                                            });
                                            setMessage('');
                                        }}
                                    >
                                        Edit settings
                                    </button>
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => {
                                            setRenaming(r.id);
                                            setName(r.name);
                                        }}
                                    >
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => {
                                            if (
                                                commit(
                                                    recipes.filter(
                                                        (item) =>
                                                            item.id !== r.id,
                                                    ),
                                                )
                                            )
                                                setRemoved(r);
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
            </ul>
            {removed && (
                <button
                    type="button"
                    className="mt-2 text-xs underline"
                    onClick={() => {
                        if (
                            recipes.some((r) => r.id === removed.id) ||
                            commit([...recipes, removed])
                        )
                            setRemoved(null);
                    }}
                >
                    Undo remove
                </button>
            )}
            {message && (
                <p role="status" className="mt-2 text-xs">
                    {message}
                </p>
            )}
        </details>
    );
}
