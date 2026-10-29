/**
 * Purpose: Implementation module for ToolbarCommands in the canvas domain.
 */
import {
    Circle,
    Copy,
    Hexagon,
    MousePointer2,
    Move,
    PenTool,
    Redo2,
    Ruler,
    Scissors,
    ScanLine,
    Spline,
    Trash2,
    Type,
    Undo2,
} from 'lucide-react';
import cx from 'classnames';
import { CanvasToolIcon } from './CanvasToolIcon';
import type { ReactNode } from 'react';
import type { DrawTool } from '../../draw/geometry';
import {
    ToolbarMenu,
    ToolbarMenuItem,
    ToolbarMenuSeparator,
    ToolbarSeparator,
} from './ToolbarControls';
import {
    toolbarButton,
    toolbarButtonBase,
    toolbarButtonActive,
    toolbarLabeledButton,
    toolbarLabel,
} from './styles';
import type { CanvasToolbarProps, ToolbarAction } from './types';

const drawTools: {
    value: NonNullable<DrawTool>;
    label: string;
    icon: ReactNode;
}[] = [
    { value: 'line', label: 'Line', icon: <CanvasToolIcon tool="line" /> },
    {
        value: 'rectangle',
        label: 'Rectangle',
        icon: <CanvasToolIcon tool="rectangle" />,
    },
    {
        value: 'rounded-rectangle',
        label: 'Rounded Rectangle',
        icon: <CanvasToolIcon tool="rounded-rectangle" />,
    },
    { value: 'polygon', label: 'Polygon', icon: <Hexagon size={18} /> },
    { value: 'circle', label: 'Circle', icon: <Circle size={18} /> },
    { value: 'arc', label: 'Arc', icon: <CanvasToolIcon tool="arc" /> },
    { value: 'bezier', label: 'Bezier', icon: <Spline size={18} /> },
    {
        value: 'polyline',
        label: 'Polyline',
        icon: <CanvasToolIcon tool="polyline" />,
    },
    { value: 'text', label: 'Text', icon: <Type size={18} /> },
    { value: 'slot', label: 'Slot', icon: <CanvasToolIcon tool="slot" /> },
    {
        value: 'ellipse',
        label: 'Ellipse',
        icon: <CanvasToolIcon tool="ellipse" />,
    },
    {
        value: 'clock',
        label: 'Clock Face',
        icon: <CanvasToolIcon tool="clock" />,
    },
    {
        value: 'mandala',
        label: 'Mandala',
        icon: <CanvasToolIcon tool="mandala" />,
    },
];

interface ToolbarCommandsProps {
    props: CanvasToolbarProps;
    open: ToolbarAction;
    close: () => void;
    group?: 'all' | 'primary' | 'secondary';
}

export function ToolbarCommands({
    props,
    open,
    close,
    group = 'all',
}: ToolbarCommandsProps) {
    const primary = group !== 'secondary';
    const selectActive =
        props.activeTool === 'select' &&
        !props.drawTool &&
        !props.cornerTool &&
        !props.guidePlacement &&
        !props.transformMode &&
        !open;

    const secondary = group !== 'primary';
    const labeledButton =
        group === 'secondary'
            ? `${toolbarButtonBase} h-11 w-full justify-start gap-2 px-3 text-sm`
            : toolbarLabeledButton;
    const labelClass = group === 'secondary' ? '' : toolbarLabel;
    const toggleTransform = (
        mode: 'move' | 'rotate' | 'scale' | 'transform',
    ) => {
        props.onTransformMode(props.transformMode === mode ? null : mode);
        close();
    };
    return (
        <>
            {primary && (
                <>
                    <button
                        title="Select (V): drag right to enclose, left to cross. Touch: one finger selects; two fingers pan and pinch to zoom."
                        aria-label="Select shapes"
                        aria-pressed={selectActive}
                        onClick={() => {
                            props.onSelectMode();
                            close();
                        }}
                        className={cx(
                            labeledButton,
                            selectActive && toolbarButtonActive,
                        )}
                    >
                        <MousePointer2 size={18} />
                        <span className={labelClass}>Select</span>
                    </button>
                </>
            )}
            {secondary && (
                <>
                    <ToolbarSeparator />
                    <button
                        title="Trim shapes"
                        aria-label="Trim shapes"
                        aria-pressed={props.activeTool === 'trim'}
                        disabled={!props.hasGeometry}
                        onClick={() => props.onTrim?.()}
                        className={cx(
                            labeledButton,
                            props.activeTool === 'trim' && toolbarButtonActive,
                        )}
                    >
                        <Scissors size={18} />
                        <span className={labelClass}>Trim</span>
                    </button>
                    <button
                        title="Transform selection"
                        aria-label="Transform selection"
                        aria-pressed={props.transformMode !== null}
                        onClick={() => toggleTransform('transform')}
                        className={cx(
                            labeledButton,
                            props.transformMode !== null && toolbarButtonActive,
                        )}
                    >
                        <Move size={18} />
                        <span className={labelClass}>Transform</span>
                    </button>
                    <ToolbarSeparator />
                </>
            )}
            {primary && (
                <ToolbarMenu
                    label="Draw"
                    active={Boolean(props.drawTool || props.guidePlacement)}
                    icon={
                        props.guidePlacement ? (
                            <Ruler size={18} />
                        ) : (
                            (drawTools.find(
                                (tool) => tool.value === props.drawTool,
                            )?.icon ?? <PenTool size={18} />)
                        )
                    }
                    wide
                >
                    {drawTools
                        .filter(
                            (tool) =>
                                tool.value !== 'clock' &&
                                tool.value !== 'mandala',
                        )
                        .map((tool) => (
                            <ToolbarMenuItem
                                key={tool.value}
                                label={tool.label}
                                icon={tool.icon}
                                active={props.drawTool === tool.value}
                                onClick={() => {
                                    props.onDrawTool(tool.value);
                                    close();
                                }}
                            />
                        ))}
                    <ToolbarMenuItem
                        label="Guide"
                        icon={<Ruler size={18} />}
                        onClick={() => {
                            props.onAddGuide();
                            close();
                        }}
                    />
                    <ToolbarMenuSeparator />
                    {drawTools
                        .filter(
                            (tool) =>
                                tool.value === 'clock' ||
                                tool.value === 'mandala',
                        )
                        .map((tool) => (
                            <ToolbarMenuItem
                                key={tool.value}
                                label={`${tool.label}…`}
                                icon={tool.icon}
                                onClick={() => {
                                    props.onDrawTool(tool.value);
                                    close();
                                }}
                            />
                        ))}
                </ToolbarMenu>
            )}
            {secondary && (
                <>
                    <ToolbarSeparator />
                    <button
                        title="Clone selection"
                        aria-label="Clone selection"
                        disabled={!props.hasSelection}
                        onClick={props.onDuplicate}
                        className={labeledButton}
                    >
                        <Copy size={18} />
                        <span className={labelClass}>Clone</span>
                    </button>
                    <button
                        title="Delete selection"
                        aria-label="Delete selection"
                        disabled={!props.hasSelection}
                        onClick={() => props.onDeleteSelected()}
                        className={cx(labeledButton, 'hover:!text-red-400')}
                    >
                        <Trash2 size={18} />
                        <span className={labelClass}>Delete</span>
                    </button>
                    <ToolbarSeparator />
                </>
            )}
            {primary && (
                <button
                    title="Undo"
                    aria-label="Undo"
                    disabled={!props.canUndo}
                    onClick={() => props.onUndo?.()}
                    className={toolbarButton}
                >
                    <Undo2 size={18} />
                </button>
            )}
            {secondary && (
                <>
                    <button
                        title="Redo"
                        aria-label="Redo"
                        disabled={!props.canRedo}
                        onClick={() => props.onRedo?.()}
                        className={
                            group === 'secondary'
                                ? labeledButton
                                : toolbarButton
                        }
                    >
                        <Redo2 size={18} />
                        {group === 'secondary' && <span>Redo</span>}
                    </button>
                    <ToolbarSeparator />
                    {props.showTrace && (
                        <button
                            title="Trace bitmap"
                            aria-label="Trace bitmap"
                            disabled={props.tracing}
                            onClick={props.onTrace}
                            className={cx(labeledButton, 'text-sm font-medium')}
                        >
                            <ScanLine size={18} className="xl:hidden" />
                            <span className={labelClass}>
                                {props.tracing ? 'Tracing…' : 'Trace'}
                            </span>
                        </button>
                    )}
                </>
            )}
        </>
    );
}
