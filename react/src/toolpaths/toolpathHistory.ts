import { freezeHistoryData } from '../lib/history';
import type { ToolpathStackEntry } from './useToolpathStack';

export async function prepareToolpathHistory(
    stack: ToolpathStackEntry[],
    signal?: AbortSignal,
) {
    const geometry = stack.flatMap((entry) =>
        entry.args.operation.startsWith('laser-') && entry.toolpath.laserPaths
            ? [
                  entry.toolpath.laserPaths,
                  entry.toolpath.previewContours,
                  entry.preview,
              ]
            : [],
    );
    // Completed geometry is replaced on edit; settings keep normal independent copies.
    await freezeHistoryData(geometry, signal);
}
