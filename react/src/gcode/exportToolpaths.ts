import { combineToolpaths } from '../lib/engine';
import type { UnitSystem } from '../lib/units';
import { DEFAULT_OUTPUT, type OutputSettings } from './profiles';
import { renderProgram } from './renderProgram';

export function exportToolpaths(
    toolpaths: Record<string, unknown>[],
    fileName: string,
    arcs: boolean,
    units: UnitSystem,
    settings: OutputSettings = DEFAULT_OUTPUT,
): string {
    const laser = toolpaths.some((path) =>
        String(path.operation).startsWith('laser'),
    );
    if (
        laser &&
        toolpaths.some((path) => !String(path.operation).startsWith('laser'))
    )
        throw new Error('Export laser and milling toolpaths separately.');
    return renderProgram(
        combineToolpaths(toolpaths, fileName, arcs && settings.arcs),
        settings,
        units,
        {
            fileName,
            laser,
            operations: toolpaths.map((path) => ({
                marker: `(${path.operationLabel} - ${path.label})`,
                name: String(path.operationLabel || path.label || ''),
                values: {
                    toolNumber: Number(path.toolNumber) || 1,
                    toolName: String(path.libraryToolName || ''),
                    toolDiameter: Number(path.toolDiameter),
                    feedRate: Number(path.feedRate),
                    plungeRate: Number(path.plungeRate),
                    safeZ: Number(path.safeZ),
                    spindleSpeed: Number(path.spindle),
                },
            })),
        },
    );
}
