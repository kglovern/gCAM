import { memo, useState, type ComponentProps } from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ToolpathStackEntry } from './useToolpathStack';

const panelRenders = jest.fn();
await jest.unstable_mockModule('./ToolpathPanel', () => ({
    ToolpathPanel: memo((props: Record<string, unknown>) => {
        panelRenders(props);
        return <div>Toolpath editor</div>;
    }),
}));

await jest.unstable_mockModule('../job/JobStockSetup', () => ({
    JobStockSetup: () => <div>Stock setup</div>,
}));

const { ToolpathRail } = await import('./ToolpathRail');

test('editing a saved laser fill retains its captured artwork groups', () => {
    const entry: ToolpathStackEntry = {
        id: 'fill',
        label: 'Fill',
        args: {
            operation: 'laser-fill',
            loops: [
                {
                    id: 'letter',
                    groupId: 'word',
                    points: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 },
                    ],
                },
            ],
            toolDiameter: 1,
            cutDepth: 1,
            laserOptions: { fillSequence: 'groups' },
        },
        toolpath: {},
        preview: [],
    };
    render(
        <ToolpathRail
            {...makeProps({
                workspace: 'laser',
                editingId: 'fill',
                editingEntry: entry,
                stack: [entry],
            })}
        />,
    );
    const props = panelRenders.mock.calls[
        panelRenders.mock.calls.length - 1
    ][0] as { editEntry: { loops: { id: string; groupId?: string }[] } };
    expect(props.editEntry.loops[0]).toEqual(
        expect.objectContaining({ id: 'letter', groupId: 'word' }),
    );
});

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

test('laser artwork stays discoverable and engraving can be ordered before cutting', () => {
    const onImportFile = jest.fn();
    const make = (
        id: string,
        label: string,
        operation: 'laser-cut' | 'laser-fill',
    ): ToolpathStackEntry => ({
        id,
        label,
        args: { operation, loops: [], toolDiameter: 1, cutDepth: 1 },
        preview: [],
        toolpath: {},
    });
    let stack = [
        make('cut', 'Cut', 'laser-cut'),
        make('fill', 'Fill', 'laser-fill'),
    ];
    const props = makeProps({
        workspace: 'laser',
        stack,
        onImportFile,
        setStack: (update) => {
            stack = typeof update === 'function' ? update(stack) : update;
        },
    });
    render(<ToolpathRail {...props} />);
    fireEvent.click(
        screen.getByRole('button', { name: 'Open image or artwork' }),
    );
    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(
        screen.getByRole('button', { name: 'Move Cut earlier' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Fill earlier' }));
    expect(stack.map((p) => p.id)).toEqual(['fill', 'cut']);
});

test('laser duplication copies geometry containing runtime methods without sharing mutable arrays', () => {
    const entry: ToolpathStackEntry = {
        id: 'original',
        label: 'Outline',
        args: {
            operation: 'laser-cut',
            loops: [],
            toolDiameter: 1,
            cutDepth: 1,
        },
        preview: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
        ],
        toolpath: {
            laserPaths: [
                {
                    points: [
                        { x: 0, y: 0, power: 300 },
                        { x: 10, y: 0, power: 300 },
                    ],
                },
            ],
            reverse: () => [],
        },
    };
    const props = makeProps({ workspace: 'laser', stack: [entry] });
    render(<ToolpathRail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Outline' }));
    const update = (props.setStack as ReturnType<typeof jest.fn>).mock
        .calls[0][0] as (current: ToolpathStackEntry[]) => ToolpathStackEntry[];
    const next = update([entry]);
    expect(next).toHaveLength(2);
    expect(next[1].id).not.toBe(entry.id);
    expect(next[1].label).toBe('Outline copy');
    expect(next[1].toolpath.reverse).toBeUndefined();
    next[1].preview[0].points[0].x = 999;
    expect(entry.preview[0].points[0].x).toBe(0);
    expect(next[1].toolpath.laserPaths).not.toBe(entry.toolpath.laserPaths);
});

test('laser bulk actions select independently from output and commit once with deletion confirmation', async () => {
    const make = (id: string): ToolpathStackEntry => ({
        id,
        label: id,
        args: {
            operation: 'laser-cut',
            loops: [],
            toolDiameter: 1,
            cutDepth: 1,
        },
        preview: [],
        toolpath: {},
    });
    const changes = jest.fn();
    let allowDelete = false;
    const confirm = jest.fn(async () => allowDelete);
    function Job() {
        const [stack, setStack] = useState([make('A'), make('B')]);
        return (
            <ToolpathRail
                {...makeProps({
                    workspace: 'laser',
                    stack,
                    confirm,
                    setStack: (update) => {
                        changes();
                        setStack(update);
                    },
                })}
            />
        );
    }
    render(<Job />);
    fireEvent.click(
        screen.getByRole('button', { name: 'Select laser operations' }),
    );
    expect(
        screen.getByRole('button', { name: 'Disable selected' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Select all laser operations'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable selected' }));
    expect(changes).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Off')).toHaveLength(2);
    expect(screen.getByLabelText('Select operation A')).toBeChecked();
    expect(screen.getByLabelText('Select operation B')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Enable selected' }));
    expect(changes).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select all laser operations'));
    fireEvent.click(screen.getByLabelText('Select operation A'));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate selected' }));
    expect(changes).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Name A copy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(changes).toHaveBeenCalledTimes(3);
    allowDelete = true;
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    await waitFor(() =>
        expect(screen.queryByLabelText('Name A')).not.toBeInTheDocument(),
    );
    expect(changes).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText('Name B')).toBeInTheDocument();
    expect(screen.getByLabelText('Name A copy')).toBeInTheDocument();
});
