import { CanvasToolIcon } from './CanvasToolIcon';
/**
 * Purpose: Implementation module for ToolbarMenus in the canvas domain.
 */
import {
    Image,
    FlipHorizontal2,
    LayoutGrid,
    RotateCw,
    AlignLeft,
    Link2,
    Copy,
    ScanLine,
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
    onBatchTrace?(): void;
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
    onBatchTrace,
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
                    {onBatchTrace && (
                        <ToolbarMenuItem
                            label="Trace images to SVG…"
                            icon={<FileCode2 size={16} />}
                            onClick={onBatchTrace}
                        />
                    )}
                    {props.onImportSvgImage && (
                        <ToolbarMenuItem
                            label="Open SVG as image…"
                            icon={<FileUp size={16} />}
                            onClick={props.onImportSvgImage}
                        />
                    )}
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
                        {props.onArrange && (
                            <ToolbarMenuItem
                                label="Arrange…"
                                icon={<AlignLeft size={16} />}
                                disabled={!props.canArrange}
                                onClick={() => {
                                    props.onArrange?.();
                                    close();
                                }}
                            />
                        )}
                        {props.onPattern && (
                            <>
                                <ToolbarMenuItem
                                    label="Mirror…"
                                    icon={<FlipHorizontal2 size={16} />}
                                    disabled={!props.canPattern}
                                    onClick={() => {
                                        props.onPattern?.('mirror');
                                        close();
                                    }}
                                />
                                <ToolbarMenuItem
                                    label="Rectangular pattern…"
                                    icon={<LayoutGrid size={16} />}
                                    disabled={!props.canPattern}
                                    onClick={() => {
                                        props.onPattern?.('rectangular');
                                        close();
                                    }}
                                />
                                <ToolbarMenuItem
                                    label="Circular pattern…"
                                    icon={<RotateCw size={16} />}
                                    disabled={!props.canPattern}
                                    onClick={() => {
                                        props.onPattern?.('circular');
                                        close();
                                    }}
                                />
                            </>
                        )}
                        {props.onSelectOpenShapes && (
                            <ToolbarMenuItem
                                label="Select open shapes"
                                icon={<ScanLine size={16} />}
                                disabled={!props.hasGeometry}
                                onClick={() => {
                                    props.onSelectOpenShapes?.();
                                    close();
                                }}
                            />
                        )}
                        {props.onSimplifyPaths && (
                            <ToolbarMenuItem
                                label="Simplify paths…"
                                icon={<Spline size={16} />}
                                disabled={!props.canConvertToBitmap}
                                onClick={() => {
                                    props.onSimplifyPaths?.();
                                    close();
                                }}
                            />
                        )}
                        {props.onDeleteDuplicates && (
                            <ToolbarMenuItem
                                label="Delete duplicates…"
                                icon={<Copy size={16} />}
                                disabled={!props.hasGeometry}
                                onClick={() => {
                                    props.onDeleteDuplicates?.();
                                    close();
                                }}
                            />
                        )}
                        {props.onRepairPaths && (
                            <ToolbarMenuItem
                                label="Repair paths…"
                                icon={<Link2 size={16} />}
                                disabled={!props.canRepairPaths}
                                onClick={() => {
                                    props.onRepairPaths?.();
                                    close();
                                }}
                            />
                        )}
                        {props.onConvertToBitmap && (
                            <ToolbarMenuItem
                                label="Convert to bitmap…"
                                icon={<Image size={16} />}
                                disabled={!props.canConvertToBitmap}
                                onClick={() => {
                                    props.onConvertToBitmap?.();
                                    close();
                                }}
                            />
                        )}
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
