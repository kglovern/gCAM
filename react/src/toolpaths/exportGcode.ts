import { DEFAULT_OUTPUT } from '../gcode/profiles';
import { saveTextFile } from '../platform/saveTextFile';
/**
 * Purpose: Shared G-code export helpers (file naming and browser download).
 */

/** Replace the source suffix with the selected controller output extension. */
export function gcodeFileName(
    fileName: string,
    extension = DEFAULT_OUTPUT.extension,
): string {
    return `${(fileName || 'gcam').replace(/\.[^.]+$/, '')}.${extension}`;
}

export function downloadGcode(
    gcode: string,
    fileName: string,
    extension = DEFAULT_OUTPUT.extension,
): void {
    if (!gcode.trim()) return;
    saveTextFile(gcode, gcodeFileName(fileName, extension));
}
