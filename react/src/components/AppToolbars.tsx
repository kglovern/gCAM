/**
 * Purpose: Implementation module for AppToolbars in the components domain.
 */
import { Download, RotateCcw, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConfigActions } from './ConfigPanel';

export function ToolButton({
    active,
    onClick,
    icon,
    label,
}: {
    active?: boolean;
    onClick?: () => void;
    icon: ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 ${
                active
                    ? 'bg-robin-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

export function ConfigToolbar({ actions }: { actions: ConfigActions }) {
    const buttonClass =
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white';

    return (
        <div
            className="flex items-center gap-0.5 shrink-0"
            role="toolbar"
            aria-label="Configuration actions"
        >
            <button
                aria-label="Export Config"
                title="Export Config"
                onClick={actions.exportConfig}
                className={buttonClass}
            >
                <Download size={16} />
                <span className="hidden sm:inline">Export Config</span>
            </button>
            <button
                aria-label="Import Config"
                title="Import Config"
                onClick={actions.importConfig}
                className={buttonClass}
            >
                <Upload size={16} />
                <span className="hidden sm:inline">Import Config</span>
            </button>
            <button
                aria-label="Reset All"
                title="Reset All"
                onClick={actions.resetConfig}
                className={`${buttonClass} text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300`}
            >
                <RotateCcw size={16} />
                <span className="hidden sm:inline">Reset All</span>
            </button>
        </div>
    );
}
