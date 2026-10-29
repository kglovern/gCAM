/**
 * Purpose: Implementation module for ToolpathEmptyState in the react domain.
 */
/** Explains why the form is unavailable before a vector selection exists. */
export function ToolpathEmptyState() {
    return (
        <div className="p-6 text-center space-y-2">
            <div className="font-medium text-slate-900 dark:text-white">
                No shapes selected
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Click or box-select shapes on the canvas to create a toolpath.
            </p>
        </div>
    );
}
