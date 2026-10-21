/**
 * Purpose: Application composition module for AppHeader.
 */
import type { ComponentProps } from 'react';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { ConfigToolbar, PreviewToolbar } from '../components/AppToolbars';
import { Sidebar } from '../components/Sidebar';
import logoUrl from '../../assets/logo.svg';

type ActiveTab = ComponentProps<typeof Sidebar>['activeTab'];

interface AppHeaderProps {
    activeTab: ActiveTab;
    toolbarProps: ComponentProps<typeof CanvasToolbar>;
    previewControls: ComponentProps<typeof PreviewToolbar>['controls'] | null;
    configActions: ComponentProps<typeof ConfigToolbar>['actions'] | null;
}

/** Application chrome; tab-specific controls remain close to their workspace. */
export function AppHeader({
    activeTab,
    toolbarProps,
    previewControls,
    configActions,
}: AppHeaderProps) {
    return (
        <header className="min-h-16 py-2 pt-[max(8px,env(safe-area-inset-top))] shrink-0 flex items-center gap-2 px-2 md:px-4 min-w-0 bg-white border-b border-slate-200 dark:bg-dark dark:border-robin-900">
            <div className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 dark:text-white shrink-0">
                <img
                    src={logoUrl}
                    alt="gCAM"
                    className="h-10 w-10 object-contain [filter:none] dark:[filter:none]"
                />
            </div>
            {activeTab === 'preview' && previewControls && (
                <PreviewToolbar controls={previewControls} />
            )}
            {activeTab === 'config' && configActions && (
                <ConfigToolbar actions={configActions} />
            )}
            {activeTab === 'toolpaths' && (
                <div className="min-w-0 flex-1 overflow-visible">
                    <CanvasToolbar {...toolbarProps} />
                </div>
            )}
        </header>
    );
}
