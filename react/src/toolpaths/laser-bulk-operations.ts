import { cloneHistoryData } from '../lib/history';
import { createDocumentId } from '../lib/ids';
import type { ToolpathStackEntry } from './useToolpathStack';

const laser = (entry: ToolpathStackEntry) =>
    entry.args.operation.startsWith('laser-');

export function setLaserOutputs(
    stack: ToolpathStackEntry[],
    ids: string[],
    enabled: boolean,
) {
    const selected = new Set(ids);
    return stack.map((entry) =>
        laser(entry) &&
        selected.has(entry.id) &&
        (entry.outputEnabled !== false) !== enabled
            ? { ...entry, outputEnabled: enabled }
            : entry,
    );
}

export function duplicateLaserOperations(
    stack: ToolpathStackEntry[],
    ids: string[],
) {
    const selected = new Set(ids);
    return stack.flatMap((entry) => {
        if (!laser(entry) || !selected.has(entry.id)) return [entry];
        const copy = cloneHistoryData(entry);
        copy.id = createDocumentId('toolpath');
        copy.label = `${copy.label.slice(0, 75)} copy`;
        copy.customLabel = copy.label;
        copy.toolpath = { ...copy.toolpath, id: copy.id, label: copy.label };
        return [entry, copy];
    });
}

/** Move each selected group one place, retaining order within and between groups. */
export function moveLaserOperations(
    stack: ToolpathStackEntry[],
    ids: string[],
    direction: -1 | 1,
) {
    const selected = new Set(ids);
    const next = [...stack];
    for (
        let i = direction < 0 ? 1 : next.length - 2;
        direction < 0 ? i < next.length : i >= 0;
        i -= direction
    ) {
        const j = i + direction;
        if (
            laser(next[i]) &&
            laser(next[j]) &&
            selected.has(next[i].id) &&
            !selected.has(next[j].id)
        )
            [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}
