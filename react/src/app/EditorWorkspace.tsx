/**
 * Purpose: Application composition module for EditorWorkspace.
 */
import { useState, type ComponentProps } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CanvasSelectionActions } from '../canvas/CanvasSelectionActions';
import { ToolpathWorkspace } from './ToolpathWorkspace';
import { CanvasStage } from '../canvas/CanvasStage';
import { EmptyCanvasPrompt } from '../canvas/EmptyCanvasPrompt';
import { CadInspector } from '../components/CadInspector';
import { ConfigPanel } from '../components/ConfigPanel';
import { ObjectTree } from '../components/ObjectTree';
import { RotarySimulation } from '../rotary/components/RotarySimulation';
import { RotaryPanel } from '../rotary/components/RotaryPanel';
import { Sidebar } from '../components/Sidebar';
import { OutputWorkspace } from '../toolpaths/OutputWorkspace';
import { ToolpathRail } from '../toolpaths/ToolpathRail';

type SidebarProps = ComponentProps<typeof Sidebar>;

interface EditorWorkspaceProps {
    simulationSource: 'toolpaths' | 'rotary';
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
    canShowProperties?: boolean;
    onShowProperties?: () => void;
    toolpathRailProps: ComponentProps<typeof ToolpathRail>;
    previewWorkspaceProps: Omit<ComponentProps<typeof OutputWorkspace>, 'mode'>;
    configPanelProps: ComponentProps<typeof ConfigPanel>;
    rotaryPanelProps: ComponentProps<typeof RotaryPanel>;
}

/** The editor's tabbed work area, isolated from document and command wiring. */
export function EditorWorkspace({
    activeTab,
    simulationSource,
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
    canShowProperties,
    onShowProperties,
    toolpathRailProps,
    previewWorkspaceProps,
    configPanelProps,
    rotaryPanelProps,
}: EditorWorkspaceProps) {
    const [additiveSelection, setAdditiveSelection] = useState(false);
    const touchLayout = useMediaQuery('(pointer: coarse), (max-width: 1099px)');
    return (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col md:flex-row">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
            {activeTab === 'toolpaths' && (
                <ToolpathWorkspace
                    rail={<ToolpathRail {...toolpathRailProps} />}
                    actions={
                        touchLayout && (
                            <CanvasSelectionActions
                                count={canvasProps.selected.length}
                                additive={additiveSelection}
                                onAdditiveChange={setAdditiveSelection}
                                onClear={() => canvasProps.onSelect([])}
                                onProperties={
                                    canShowProperties
                                        ? onShowProperties
                                        : undefined
                                }
                            />
                        )
                    }
                >
                    <main
                        className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-2 md:p-3 flex flex-col gap-2 min-h-0"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            onDropFiles(event.dataTransfer.files);
                        }}
                    >
                        <div className="relative flex-1 min-h-0">
                            <CanvasStage
                                {...canvasProps}
                                additiveSelection={additiveSelection}
                            />
                            {treeOpen && (
                                <ObjectTree
                                    {...objectTreeProps}
                                    onEdit={() => {
                                        objectTreeProps.onClose();
                                        objectTreeProps.onEdit?.();
                                    }}
                                    additiveSelection={additiveSelection}
                                    onAdditiveChange={setAdditiveSelection}
                                />
                            )}
                            {showEmptyState && (
                                <EmptyCanvasPrompt
                                    onNewCanvas={onNewCanvas}
                                    onImport={onImport}
                                    onLoadSample={onLoadSample}
                                    loadingSample={loadingSample}
                                    onRotary={() => {
                                        rotaryPanelProps.rotary.setMode('stl');
                                        onTabChange('rotary');
                                    }}
                                />
                            )}
                            {inspector && !treeOpen && (
                                <CadInspector {...inspector} />
                            )}
                        </div>
                        <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate">
                            {status}
                        </div>
                    </main>
                </ToolpathWorkspace>
            )}
            {activeTab === 'preview' && simulationSource === 'rotary' && (
                <RotarySimulation {...rotaryPanelProps} />
            )}
            {activeTab === 'preview' && simulationSource !== 'rotary' && (
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
