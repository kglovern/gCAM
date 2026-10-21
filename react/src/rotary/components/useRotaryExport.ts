import { saveTextFile } from '../../platform/saveTextFile';
import { useState } from 'react';
import type { UseRotaryState } from '../useRotaryState';

/** Export is tied to the exact setup used to generate it, never an old preview. */
export function useRotaryExport(rotary: UseRotaryState) {
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const key = JSON.stringify(rotary.snapshotProject());
    const needsModel = rotary.mode === 'stl' && !rotary.stlMesh;
    const errors =
        rotary.flags.filter((flag) => flag.level === 'e').length +
        (needsModel ? 1 : 0);
    const ready = generatedKey === key && Boolean(rotary.gcode) && errors === 0;
    const generate = () => {
        if (errors || !rotary.moves.length) return;
        rotary.generate();
        setGeneratedKey(key);
    };
    const download = () => {
        if (!ready) return;
        saveTextFile(
            rotary.gcode,
            `${rotary.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || 'rotary'}.gcode`,
        );
    };
    return { ready, generate, download, errors, needsModel };
}
