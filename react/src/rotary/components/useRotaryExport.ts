import { useEffect, useState } from 'react';
import type { UseRotaryState } from '../useRotaryState';

/** Export is tied to the exact setup used to generate it, with automatic generation after editing settles. */
export function useRotaryExport(rotary: UseRotaryState) {
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const {
        tool: _tool,
        ops: _ops,
        operation: _operation,
        toolpathEditorOpen: _editorOpen,
        editingToolpathId: _editingId,
        ...job
    } = rotary.snapshotProject();
    const key = JSON.stringify(job);
    const needsModel = rotary.mode === 'stl' && !rotary.stlMesh;
    const errors =
        rotary.flags.filter((flag) => flag.level === 'e').length +
        (needsModel ? 1 : 0);
    const ready =
        generatedKey === key &&
        Boolean(rotary.gcode) &&
        errors === 0 &&
        rotary.moves.length > 0;
    useEffect(() => {
        if (errors || !rotary.moves.length) return;
        const timer = window.setTimeout(() => {
            rotary.generate();
            setGeneratedKey(key);
        }, 400);
        return () => window.clearTimeout(timer);
    }, [key, errors, rotary.moves.length, rotary.generate]);
    return { ready, errors, needsModel };
}
