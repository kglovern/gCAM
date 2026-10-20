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
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = gcodeFileName(fileName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
