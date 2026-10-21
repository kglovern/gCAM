/**
 * Purpose: Application composition module for EditorWorkspace.
 */
import type { ComponentProps } from 'react';
import { CanvasStage } from '../canvas/CanvasStage';
import { EmptyCanvasPrompt } from '../canvas/EmptyCanvasPrompt';
import { CadInspector } from '../components/CadInspector';
import { ConfigPanel } from '../components/ConfigPanel';
import { ObjectTree } from '../components/ObjectTree';
import { RotaryPanel } from '../rotary/components/RotaryPanel';
import { Sidebar } from '../components/Sidebar';
import { OutputWorkspace } from '../toolpaths/OutputWorkspace';
import { ToolpathRail } from '../toolpaths/ToolpathRail';

type SidebarProps = ComponentProps<typeof Sidebar>;

interface EditorWorkspaceProps {
    activeTab: SidebarProps['activeTab'];
    onTabChange: SidebarProps['onTabChange'];
    canvasProps: ComponentProps<typeof CanvasStage>;
    objectTreeProps: ComponentProps<typeof ObjectTree>;
    treeOpen: boolean;
    showEmptyState: boolean;
    onNewCanvas: () => void;
    onImport: () => void;
    onLoadSample: () => void;
    loadingSample: boolean;
    status: string;
    onDropFiles: (files: FileList) => void;
    inspector: ComponentProps<typeof CadInspector> | null;
    toolpathRailProps: ComponentProps<typeof ToolpathRail>;
    previewWorkspaceProps: Omit<ComponentProps<typeof OutputWorkspace>, 'mode'>;
    configPanelProps: ComponentProps<typeof ConfigPanel>;
    rotaryPanelProps: ComponentProps<typeof RotaryPanel>;
}

/** The editor's tabbed work area, isolated from document and command wiring. */
export function EditorWorkspace({
    activeTab,
    onTabChange,
    canvasProps,
    objectTreeProps,
    treeOpen,
    showEmptyState,
    onNewCanvas,
    onImport,
    onLoadSample,
    loadingSample,
    status,
    onDropFiles,
    inspector,
    toolpathRailProps,
    previewWorkspaceProps,
    configPanelProps,
    rotaryPanelProps,
}: EditorWorkspaceProps) {
    return (
        <div className="flex-1 min-h-0 flex">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
            {activeTab === 'toolpaths' && (
                <>
                    <main
                        className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-2 min-h-0"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            onDropFiles(event.dataTransfer.files);
                        }}
                    >
                        <div className="relative flex-1 min-h-0">
                            <CanvasStage {...canvasProps} />
                            {treeOpen && <ObjectTree {...objectTreeProps} />}
                            {showEmptyState && (
                                <EmptyCanvasPrompt
                                    onNewCanvas={onNewCanvas}
                                    onImport={onImport}
                                    onLoadSample={onLoadSample}
                                    loadingSample={loadingSample}
                                />
                            )}
                            {inspector && <CadInspector {...inspector} />}
                        </div>
                        <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate">
                            {status}
                        </div>
                    </main>
                    <ToolpathRail {...toolpathRailProps} />
                </>
            )}
            {activeTab === 'preview' && (
                <OutputWorkspace mode="preview" {...previewWorkspaceProps} />
            )}
            {activeTab === 'config' && (
                <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 min-h-0">
                    <ConfigPanel {...configPanelProps} />
                </main>
            )}
            {activeTab === 'rotary' && <RotaryPanel {...rotaryPanelProps} />}
        </div>
    );
}
