import { memo, type ComponentProps } from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ToolpathStackEntry } from './useToolpathStack';

const panelRenders = jest.fn();
await jest.unstable_mockModule('./ToolpathPanel', () => ({
    ToolpathPanel: memo(() => {
        panelRenders();
        return <div>Toolpath editor</div>;
    }),
}));

await jest.unstable_mockModule('../job/JobStockSetup', () => ({
    JobStockSetup: () => <div>Stock setup</div>,
}));

const { ToolpathRail } = await import('./ToolpathRail');

function makeProps(
    overrides: Partial<ComponentProps<typeof ToolpathRail>> = {},
) {
    return {
        loops: [],
        selected: [],
        bitmaps: [],
        stack: [],
        gcode: 'G90\n',
        fileName: 'job.nc',
        units: 'metric',
        emitArcs: true,
        machineProfileId: 'longmill-router',
        machineTravelLimits: {
            maxXTravelMm: null,
            maxYTravelMm: null,
            minZTravelMm: null,
            maxZTravelMm: null,
        },
        stock: {
            widthMm: 100,
            heightMm: 100,
            thicknessMm: 18,
            material: 'softwood',
        },
        setStock: jest.fn(),
        editingId: null,
        editingEntry: null,
        tabMode: false,
        setTabMode: jest.fn(),
        setEditingId: jest.fn(),
        setStack: jest.fn(),
        setSideTab: jest.fn(),
        setStatus: jest.fn(),
        setDraftPreview: jest.fn(),
        setDraftProgress: jest.fn(),
        onResult: jest.fn(),
        onUpdate: jest.fn(),
        rebuildEntryTabs: jest.fn(),
        confirm: jest.fn(async () => true),
        showToast: jest.fn(),
        onImportFile: jest.fn(),
        ...overrides,
    } as ComponentProps<typeof ToolpathRail>;
}

test('shows stock, the committed list, tabs and G-code export when nothing is selected', () => {
    const onImportFile = jest.fn();
    render(<ToolpathRail {...makeProps({ onImportFile })} />);

    expect(screen.getByText('Stock setup')).toBeInTheDocument();
    expect(
        screen.getByRole('heading', { name: 'Start with a design' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('heading', { name: 'Start with a design' })
            .parentElement,
    ).toHaveClass('mt-1', 'mb-1');
    expect(
        screen.getByRole('button', { name: 'Import a file' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import a file' }));
    expect(onImportFile).toHaveBeenCalledTimes(1);
    const jobToolpathsHeading = screen.getByRole('heading', {
        name: 'Job toolpaths (0)',
    });
    expect(jobToolpathsHeading).toBeInTheDocument();
    expect(jobToolpathsHeading.closest('section')).toHaveClass('mt-1');
    expect(
        screen.queryByRole('button', { name: 'Add a Tab' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export G-code' })).toBeEnabled();
    expect(
        screen.getByText('Ready to make your first toolpath?'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(
            /Click a shape on the canvas, or drag a box around several shapes/,
        ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Toolpath editor')).not.toBeInTheDocument();
});

test('keeps Clear Tabs visible but disabled with an explanation when no tabs exist', () => {
    const entry: ToolpathStackEntry = {
        id: 'path-no-tabs',
        label: 'Outside profile',
        args: {
            loops: [],
            operation: 'profile-outside',
            toolDiameter: 6,
            cutDepth: 3,
            tabs: [],
        },
        preview: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
        ],
        toolpath: {},
    };
    render(<ToolpathRail {...makeProps({ stack: [entry] })} />);

    expect(screen.getByRole('button', { name: 'Auto Tabs' })).toBeEnabled();
    const clearButton = screen.getByRole('button', { name: 'Clear Tabs' });
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveAttribute(
        'aria-describedby',
        'clear-tabs-hint-path-no-tabs',
    );
    expect(clearButton.parentElement).toHaveAttribute(
        'title',
        'There are no tabs to remove from this toolpath.',
    );
});

test('keeps stock editable while hiding export during toolpath editing', () => {
    render(<ToolpathRail {...makeProps({ selected: ['vector-1'] })} />);

    expect(screen.getByText('Toolpath editor')).toBeInTheDocument();
    expect(screen.getByText('Stock setup')).not.toBeVisible();
    fireEvent.click(screen.getByText(/Job stock ·/));
    expect(screen.getByText('Stock setup')).toBeVisible();
    expect(screen.queryByText('Toolpath Setup')).not.toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: 'Start with a design' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: /Job toolpaths/ }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Export G-code' }),
    ).not.toBeInTheDocument();
});

test('clearing the canvas selection removes the uncommitted preview and progress', () => {
    const setDraftPreview = jest.fn();
    const setDraftProgress = jest.fn();
    const { rerender } = render(
        <ToolpathRail
            {...makeProps({
                loops: [{ id: 'vector-1', points: [] }] as never,
                selected: ['vector-1'],
                setDraftPreview,
                setDraftProgress,
            })}
        />,
    );

    rerender(
        <ToolpathRail
            {...makeProps({
                loops: [{ id: 'vector-1', points: [] }] as never,
                setDraftPreview,
                setDraftProgress,
            })}
        />,
    );

    expect(setDraftPreview).toHaveBeenCalledWith([]);
    expect(setDraftProgress).toHaveBeenCalledWith(null);
});

test('hides the import callout when the workspace contains a bitmap or toolpath', () => {
    const bitmap = { id: 'bitmap-1', x: 0, y: 0, w: 10, h: 10 };
    const { rerender } = render(
        <ToolpathRail {...makeProps({ bitmaps: [bitmap] })} />,
    );
    expect(
        screen.queryByRole('heading', { name: 'Start with a design' }),
    ).not.toBeInTheDocument();

    rerender(
        <ToolpathRail
            {...makeProps({
                stack: [
                    {
                        id: 'path-1',
                        label: 'Pocket',
                        args: {
                            loops: [],
                            operation: 'profile-outside',
                            toolDiameter: 6,
                            cutDepth: 1,
                        },
                        preview: [],
                        toolpath: {},
                    },
                ],
            })}
        />,
    );
    expect(
        screen.queryByRole('heading', { name: 'Start with a design' }),
    ).not.toBeInTheDocument();
});

test('shows only the edited toolpath and hides the created list while editing', () => {
    const entry: ToolpathStackEntry = {
        id: 'path-1',
        label: 'Outside Profile',
        args: {
            loops: [],
            operation: 'profile-outside',
            toolDiameter: 6,
            cutDepth: 3,
        },
        preview: [],
        toolpath: {},
    };
    render(
        <ToolpathRail
            {...makeProps({ editingId: entry.id, editingEntry: entry })}
        />,
    );

    expect(screen.getByText('Toolpath editor')).toBeInTheDocument();
    expect(screen.queryByText('Edit Outside Profile')).not.toBeInTheDocument();
    expect(screen.getByText('Stock setup')).not.toBeVisible();
    expect(
        screen.queryByRole('heading', { name: /Job toolpaths/ }),
    ).not.toBeInTheDocument();
});

test('keeps the sidebar editor stable when unrelated parent updates replace event handlers', () => {
    panelRenders.mockClear();
    const props = makeProps({
        selected: ['shape'],
        loops: [
            {
                id: 'shape',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 10 },
                ],
            },
        ],
    });
    const view = render(<ToolpathRail {...props} />);
    expect(panelRenders).toHaveBeenCalledTimes(1);
    for (let n = 0; n < 5; n++) {
        view.rerender(
            <ToolpathRail
                {...props}
                onResult={jest.fn()}
                onUpdate={jest.fn()}
                onStockThickness={jest.fn()}
            />,
        );
    }
    expect(panelRenders).toHaveBeenCalledTimes(1);
});
