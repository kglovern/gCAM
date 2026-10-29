import { CanvasToolIcon } from './CanvasToolIcon';
/**
 * Purpose: Implementation module for ToolbarMenus in the canvas domain.
 */
import {
    Download,
    Eye,
    File,
    FileCode2,
    FilePlus2,
    FileUp,
    FolderOpen,
    Grid3X3,
    Group,
    Hexagon,
    Maximize2,
    Minus,
    PanelRight,
    Scissors,
    Square,
    SunMoon,
    Spline,
    Type,
    Ungroup,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import {
    ToolbarMenu,
    ToolbarMenuItem,
    ToolbarMenuSeparator,
    ToolbarSeparator,
} from './ToolbarControls';
import type { CanvasToolbarProps, ToolbarAction } from './types';

interface ToolbarMenusProps {
    latheProfile?: { import(): void; export(): void };
    props: CanvasToolbarProps;
    openAction: (action: Exclude<ToolbarAction, null>) => void;
    close: () => void;
    group?: 'all' | 'file' | 'secondary';
    activeAction?: ToolbarAction;
}

/** Project, modification, grouping, and view menu groups for the canvas toolbar. */
export function ToolbarMenus({
    props,
    openAction,
    close,
    group = 'all',
    activeAction,
    latheProfile,
}: ToolbarMenusProps) {
    return (
        <>
            {group !== 'secondary' && (
                <ToolbarMenu label="File" icon={<File size={18} />} wide>
                    <ToolbarMenuItem
                        label="Open File"
                        icon={<FolderOpen size={16} />}
                        onClick={() => props.onImportFile?.()}
                    />
                    <ToolbarMenuSeparator />
                    {latheProfile && (
                        <>
                            <ToolbarMenuItem
                                label="Import Lathe Profile"
                                icon={<FileUp size={16} />}
                                onClick={latheProfile.import}
                            />
                            <ToolbarMenuItem
                                label="Export Lathe Profile"
                                icon={<Download size={16} />}
                                onClick={latheProfile.export}
                            />
                            <ToolbarMenuSeparator />
                        </>
                    )}
                    <ToolbarMenuItem
                        label="New Project"
                        icon={<FilePlus2 size={16} />}
                        onClick={() => props.onNewCanvas?.()}
                    />
                    <ToolbarMenuItem
                        label="Import Project"
                        icon={<FolderOpen size={16} />}
                        onClick={() => props.onImportProject?.()}
                    />
                    <ToolbarMenuItem
                        label="Export Project"
                        icon={<Download size={16} />}
                        onClick={() => props.onExportProject?.()}
                    />
                    <ToolbarMenuSeparator />
                    <ToolbarMenuItem
                        label="Export G-code"
                        icon={<FileCode2 size={16} />}
                        onClick={() => props.onViewPreview?.()}
                    />
                </ToolbarMenu>
            )}
            {group !== 'file' && (
                <>
                    <ToolbarSeparator />
                    <ToolbarMenu
                        label="Modify"
                        active={Boolean(
                            props.cornerTool ||
                                ['offset', 'boolean', 'nest'].includes(
                                    activeAction ?? '',
                                ),
                        )}
                        icon={
                            props.cornerTool === 'dogbone' ||
                            props.cornerTool === 'fillet' ||
                            props.cornerTool === 'chamfer' ? (
                                <CanvasToolIcon tool={props.cornerTool} />
                            ) : activeAction === 'offset' ||
                              activeAction === 'boolean' ? (
                                <CanvasToolIcon tool={activeAction} />
                            ) : activeAction === 'nest' ? (
                                <Grid3X3 size={18} />
                            ) : (
                                <Scissors size={18} />
                            )
                        }
                        iconOnly
                    >
                        <ToolbarMenuItem
                            label="Fillet…"
                            active={props.cornerTool === 'fillet'}
                            icon={<CanvasToolIcon tool="fillet" />}
                            onClick={() => {
                                props.onApplyFillet();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Chamfer…"
                            active={props.cornerTool === 'chamfer'}
                            icon={<CanvasToolIcon tool="chamfer" />}
                            onClick={() => {
                                props.onApplyChamfer?.();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Dogbone"
                            active={props.cornerTool === 'dogbone'}
                            icon={<CanvasToolIcon tool="dogbone" />}
                            onClick={() => {
                                props.onApplyDogbone();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Combine / Subtract…"
                            disabled={!props.canBoolean}
                            icon={<CanvasToolIcon tool="boolean" />}
                            onClick={() => openAction('boolean')}
                        />
                        <ToolbarMenuItem
                            label="Offset…"
                            disabled={!props.hasSelection}
                            icon={<CanvasToolIcon tool="offset" />}
                            onClick={() => openAction('offset')}
                        />
                        <ToolbarMenuItem
                            label="Nest…"
                            disabled={!props.canBoolean}
                            icon={<Grid3X3 size={16} />}
                            onClick={() => openAction('nest')}
                        />
                    </ToolbarMenu>
                    <ToolbarMenu
                        label="Group"
                        icon={<Group size={18} />}
                        iconOnly
                    >
                        <ToolbarMenuItem
                            label="Group"
                            icon={<Group size={16} />}
                            disabled={!props.canGroup}
                            onClick={() => props.onGroup?.()}
                        />
                        <ToolbarMenuItem
                            label="Ungroup"
                            icon={<Ungroup size={16} />}
                            disabled={!props.canUngroup}
                            onClick={() => props.onUngroup?.()}
                        />
                    </ToolbarMenu>
                    <ToolbarMenu label="View" icon={<Eye size={18} />} iconOnly>
                        <ToolbarMenuItem
                            label="Dark / Light Mode"
                            icon={<SunMoon size={16} />}
                            onClick={() => props.onToggleDarkMode?.()}
                        />
                        <ToolbarMenuItem
                            label={
                                props.snapToGrid
                                    ? 'Snap to Grid ✓'
                                    : 'Snap to Grid'
                            }
                            icon={<Grid3X3 size={16} />}
                            onClick={() => props.onToggleSnapToGrid?.()}
                        />
                        <ToolbarMenuItem
                            label="Fit View"
                            icon={<Maximize2 size={16} />}
                            onClick={() => props.onFitView?.()}
                        />
                        <ToolbarMenuItem
                            label="Zoom In"
                            icon={<ZoomIn size={16} />}
                            onClick={() => props.onZoomIn?.()}
                        />
                        <ToolbarMenuItem
                            label="Zoom Out"
                            icon={<ZoomOut size={16} />}
                            onClick={() => props.onZoomOut?.()}
                        />
                        <ToolbarMenuItem
                            label="Object Browser"
                            icon={<PanelRight size={16} />}
                            onClick={() => props.onToggleObjects?.()}
                        />
                    </ToolbarMenu>
                    <ToolbarSeparator />
                </>
            )}
        </>
    );
}
