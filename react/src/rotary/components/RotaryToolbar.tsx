import { saveTextFile } from '../../platform/saveTextFile';
import { useRef, useState } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { ToolbarMenus } from '../../canvas/toolbar/ToolbarMenus';
import { ToolbarSeparator } from '../../canvas/toolbar/ToolbarControls';
import { toolbarButton } from '../../canvas/toolbar/styles';
import type { CanvasToolbarProps } from '../../canvas/toolbar/types';
import type { UseRotaryState } from '../useRotaryState';
import { exportProfile, importProfile } from '../engine/profileFile';

export function RotaryToolbar({
    rotary: R,
    commands,
}: {
    rotary: UseRotaryState;
    commands: CanvasToolbarProps;
}) {
    const input = useRef<HTMLInputElement>(null);
    const profileInput = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    return (
        <div
            className="relative flex flex-wrap items-center gap-0.5"
            role="toolbar"
            aria-label="Rotary tools"
        >
            <ToolbarMenus
                props={{
                    ...commands,
                    onImportFile: () => input.current?.click(),
                }}
                group="file"
                latheProfile={{
                    import: () => profileInput.current?.click(),
                    export: () => {
                        saveTextFile(
                            exportProfile(R.points),
                            `${R.name || 'lathe'}.lathe-profile.json`,
                            'application/json',
                        );
                    },
                }}
                openAction={() => {}}
                close={() => {}}
            />
            <ToolbarSeparator />
            <button
                type="button"
                className={toolbarButton}
                aria-label="Undo rotary change"
                title="Undo"
                disabled={!R.canUndo}
                onClick={R.undo}
            >
                <Undo2 size={18} />
            </button>
            <button
                type="button"
                className={toolbarButton}
                aria-label="Redo rotary change"
                title="Redo"
                disabled={!R.canRedo}
                onClick={R.redo}
            >
                <Redo2 size={18} />
            </button>
            <input
                ref={input}
                type="file"
                accept=".stl"
                className="hidden"
                aria-label="Import rotary STL file"
                onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    setError('');
                    try {
                        await R.importStlFile(file);
                    } catch (error) {
                        setError(
                            error instanceof Error
                                ? error.message
                                : 'Could not read this STL.',
                        );
                    }
                }}
            />
            {error && (
                <span role="alert" className="px-2 text-xs text-red-600">
                    {error}
                </span>
            )}
            <input
                ref={profileInput}
                type="file"
                accept=".json"
                className="hidden"
                aria-label="Import lathe profile file"
                onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    setError('');
                    try {
                        if (file.size > 5 * 1024 * 1024)
                            throw new Error(
                                'Lathe profile file is too large (maximum 5 MB).',
                            );
                        const points = importProfile(await file.text());
                        R.commitPoints(points);
                        R.setSel(-1);
                    } catch (error) {
                        setError(
                            error instanceof Error
                                ? error.message
                                : 'Could not read this lathe profile.',
                        );
                    }
                }}
            />
        </div>
    );
}
