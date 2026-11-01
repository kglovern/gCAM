import { cloneHistoryData } from '../lib/history';

/** Omit construction geometry and duplicate preview points from modern laser jobs. */
export function laserExportPayload(toolpaths: Record<string, unknown>[]) {
    return toolpaths.map((path) => {
        if (!path.laserPaths) return cloneHistoryData(path);
        return {
            ...Object.fromEntries(
                Object.entries(path).filter(
                    ([, value]) =>
                        value === null ||
                        !['object', 'function'].includes(typeof value),
                ),
            ),
            laserPaths: path.laserPaths,
            laserOptions: path.laserOptions,
            laserRotary: path.laserRotary,
            laserFocusTest: path.laserFocusTest,
            passDepths: path.passDepths,
            previewContours: [],
        };
    });
}
