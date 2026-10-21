import { saveTextFile } from '../platform/saveTextFile';
/**
 * Purpose: Shared G-code export helpers (file naming and browser download).
 */

/** Output file name for a job: the source name with a fixed `.nc` extension. */
export function gcodeFileName(fileName: string): string {
    // camcanvas always exported GRBL as fixed .nc
    return `${(fileName || 'gcam').replace(/\.[^.]+$/, '')}.nc`;
}

export function downloadGcode(gcode: string, fileName: string): void {
    if (!gcode.trim()) return;
    saveTextFile(gcode, gcodeFileName(fileName));
}
