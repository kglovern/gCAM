/**
 * Purpose: Implementation module for ToolbarMenus in the canvas domain.
 */
import {
    ArrowUpRight,
    Combine,
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
    Radius,
    Scissors,
    Square,
    SunMoon,
    Spline,
    Triangle,
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
}

/** Project, modification, grouping, and view menu groups for the canvas toolbar. */
export function ToolbarMenus({
    props,
    openAction,
    close,
    group = 'all',
    latheProfile,
}: ToolbarMenusProps) {
    return (
        <>
            {group !== 'secondary' && (
                <ToolbarMenu label="File" icon={<File size={18} />} wide>
                    <ToolbarMenuItem
                        label="New Project"
                        icon={<FilePlus2 size={16} />}
                        onClick={() => props.onNewCanvas?.()}
                    />
                    <ToolbarMenuItem
                        label="Import File"
                        icon={<FileUp size={16} />}
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
                        icon={<Scissors size={18} />}
                        iconOnly
                    >
                        <ToolbarMenuItem
                            label="Fillet…"
                            icon={<Radius size={16} />}
                            onClick={() => {
                                props.onApplyFillet();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Chamfer…"
                            icon={<Triangle size={16} />}
                            onClick={() => {
                                props.onApplyChamfer?.();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Dogbone"
                            icon={<Combine size={16} />}
                            onClick={() => {
                                props.onApplyDogbone();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Combine / Subtract…"
                            icon={<Combine size={16} />}
                            onClick={() => openAction('boolean')}
                        />
                        <ToolbarMenuItem
                            label="Offset…"
                            icon={<ArrowUpRight size={16} />}
                            onClick={() => openAction('offset')}
                        />
                        <ToolbarMenuItem
                            label="Nest…"
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
