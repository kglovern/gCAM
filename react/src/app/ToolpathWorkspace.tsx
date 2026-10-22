import type { ReactNode } from 'react';

/** Keep canvas and settings mounted together when the workspace changes shape. */
export function ToolpathWorkspace({
    children,
    rail,
    actions,
}: {
    children: ReactNode;
    rail: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="toolpath-workspace relative flex min-h-0 min-w-0 flex-1 flex-col">
            {actions && (
                <div className="flex shrink-0 items-center justify-end gap-1 border-b border-slate-200 bg-white px-2 md:px-3 py-1 dark:border-robin-900 dark:bg-dark">
                    {actions}
                </div>
            )}
            <div className="toolpath-workspace-split relative grid min-h-0 flex-1">
                {children}
                <section
                    aria-label="Toolpath settings panel"
                    className="toolpath-workspace-panel flex min-h-0 min-w-0 flex-col"
                >
                    {rail}
                </section>
            </div>
        </div>
    );
}
