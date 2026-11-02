import { CanvasToolIcon } from './CanvasToolIcon';
/**
 * Purpose: Implementation module for ToolbarMenus in the canvas domain.
 */
import {
    Image,
    SquarePen,
    Trash2,
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
                        label="Edit"
                        active={Boolean(
                            props.activeTool === 'trim' ||
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
                            ) : props.activeTool === 'trim' ? (
                                <Scissors size={18} />
                            ) : (
                                <SquarePen size={18} />
                            )
                        }
                    >
                        <ToolbarMenuItem
                            label="Clone"
                            icon={<Copy size={16} />}
                            disabled={!props.hasSelection}
                            onClick={() => {
                                props.onDuplicate();
                                close();
                            }}
                        />
                        <ToolbarMenuItem
                            label="Delete"
                            icon={<Trash2 size={16} />}
                            danger
                            disabled={!props.hasSelection}
                            onClick={() => {
                                props.onDeleteSelected();
                                close();
                            }}
                        />
                        <ToolbarMenuSeparator />
                        <ToolbarMenuItem
                            label="Trace into shapes…"
                            icon={<ScanLine size={16} />}
                            disabled={!props.showTrace || props.tracing}
                            onClick={() => {
                                props.onTrace();
                                close();
                            }}
                        />
                        <ToolbarMenuSeparator />
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
                        <ToolbarMenuSeparator />
                        <ToolbarMenuItem
                            label="Trim"
                            icon={<Scissors size={16} />}
                            active={props.activeTool === 'trim'}
                            disabled={!props.hasGeometry}
                            onClick={() => {
                                props.onTrim?.();
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
                        <ToolbarMenuSeparator />
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
                        <ToolbarMenuSeparator />
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
                        <ToolbarMenuItem
                            label="Nest…"
                            disabled={!props.canBoolean}
                            icon={<Grid3X3 size={16} />}
                            onClick={() => openAction('nest')}
                        />
                        <ToolbarMenuSeparator />
                        {props.onMaskImage && (
                            <>
                                <ToolbarMenuItem
                                    label="Mask image to shapes"
                                    icon={<Image size={16} />}
                                    disabled={!props.canMaskImage}
                                    onClick={() => {
                                        props.onMaskImage?.();
                                        close();
                                    }}
                                />
                                <ToolbarMenuItem
                                    label="Edit image inside mask"
                                    icon={<Image size={16} />}
                                    disabled={!props.hasImageMask}
                                    onClick={() => {
                                        props.onEditMaskedImage?.();
                                        close();
                                    }}
                                />
                                <ToolbarMenuItem
                                    label="Edit mask shapes"
                                    icon={<ScanLine size={16} />}
                                    disabled={!props.hasImageMask}
                                    onClick={() => {
                                        props.onEditMaskShapes?.();
                                        close();
                                    }}
                                />
                                <ToolbarMenuItem
                                    label="Release image mask"
                                    icon={<Image size={16} />}
                                    disabled={!props.hasImageMask}
                                    onClick={() => {
                                        props.onReleaseImageMask?.();
                                        close();
                                    }}
                                />
                            </>
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
                    </ToolbarMenu>
                    <ToolbarMenu label="Group" icon={<Group size={18} />}>
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
                    <ToolbarMenu label="View" icon={<Eye size={18} />}>
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
