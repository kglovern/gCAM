import { jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ToolbarMenus } from './ToolbarMenus';
import type { CanvasToolbarProps } from './types';

test.each([false, true])(
    'trace requires exactly one traceable bitmap (%s)',
    (available) => {
        const onTrace = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        showTrace: available,
                        onTrace,
                    } as unknown as CanvasToolbarProps
                }
                openAction={jest.fn()}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const command = screen.getByRole('menuitem', {
            name: 'Trace into shapes…',
        });
        if (available) expect(command).toBeEnabled();
        else expect(command).toBeDisabled();
        fireEvent.click(command);
        expect(onTrace).toHaveBeenCalledTimes(available ? 1 : 0);
    },
);

test.each([false, true])(
    'mask commands require an eligible selection (%s)',
    (eligible) => {
        const onMaskImage = jest.fn(),
            onReleaseImageMask = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        onMaskImage,
                        onReleaseImageMask,
                        canMaskImage: eligible,
                        hasImageMask: eligible,
                    } as unknown as CanvasToolbarProps
                }
                openAction={jest.fn()}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const apply = screen.getByRole('menuitem', {
                name: 'Mask image to shapes',
            }),
            release = screen.getByRole('menuitem', {
                name: 'Release image mask',
            });
        if (eligible) {
            expect(apply).toBeEnabled();
            expect(release).toBeEnabled();
        } else {
            expect(apply).toBeDisabled();
            expect(release).toBeDisabled();
        }
        fireEvent.click(apply);
        fireEvent.click(release);
        expect(onMaskImage).toHaveBeenCalledTimes(eligible ? 1 : 0);
        expect(onReleaseImageMask).toHaveBeenCalledTimes(eligible ? 1 : 0);
    },
);
test.each([false, true])(
    'Arrange requires independent selected objects (%s)',
    (eligible) => {
        const onArrange = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        onArrange,
                        canArrange: eligible,
                    } as unknown as CanvasToolbarProps
                }
                openAction={jest.fn()}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const item = screen.getByRole('menuitem', { name: 'Arrange…' });
        if (eligible) expect(item).toBeEnabled();
        else expect(item).toBeDisabled();
        fireEvent.click(item);
        expect(onArrange).toHaveBeenCalledTimes(eligible ? 1 : 0);
    },
);

test.each([0, 1, 2])(
    'selection actions require enough shapes: %i selected',
    (count) => {
        const openAction = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        hasSelection: count > 0,
                        canBoolean: count >= 2,
                    } as CanvasToolbarProps
                }
                openAction={openAction}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        for (const [name, minimum] of [
            ['Combine / Subtract…', 2],
            ['Offset…', 1],
            ['Nest…', 2],
        ] as const) {
            const item = screen.getByRole('menuitem', { name });
            if (count < minimum) {
                expect(item).toBeDisabled();
                fireEvent.click(item);
                expect(openAction).not.toHaveBeenCalled();
            } else expect(item).toBeEnabled();
        }
    },
);

test('orders file actions with separators around project actions and G-code export', () => {
    const onImportFile = jest.fn();
    const props = {
        onNewCanvas: jest.fn(),
        onImportFile,
        onImportProject: jest.fn(),
        onExportProject: jest.fn(),
        onViewPreview: jest.fn(),
    } as unknown as CanvasToolbarProps;

    render(
        <ToolbarMenus props={props} openAction={jest.fn()} close={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(
        screen.queryByRole('menuitem', { name: /Trace images to SVG/i }),
    ).not.toBeInTheDocument();

    const fileButton = screen.getByRole('button', { name: 'File' });
    const menu = fileButton.parentElement?.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const fileMenu = within(menu as HTMLElement);
    const items = fileMenu.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
        'Open File',
        'New Project',
        'Import Project',
        'Export Project',
        'Export G-code',
    ]);
    expect(fileMenu.getAllByRole('separator')).toHaveLength(2);

    fireEvent.click(fileMenu.getByRole('menuitem', { name: 'Open File' }));
    expect(onImportFile).toHaveBeenCalledTimes(1);
});

test('Modify stays highlighted while a corner editing tool is active', () => {
    render(
        <ToolbarMenus
            props={{ cornerTool: 'dogbone' } as CanvasToolbarProps}
            openAction={jest.fn()}
            close={jest.fn()}
        />,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
});

test('offers SVG image import only when that workspace supplies the command', () => {
    const onImportSvgImage = jest.fn();
    render(
        <ToolbarMenus
            props={{ onImportSvgImage } as unknown as CanvasToolbarProps}
            openAction={jest.fn()}
            close={jest.fn()}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(
        screen.getByRole('menuitem', { name: 'Open SVG as image…' }),
    );
    expect(onImportSvgImage).toHaveBeenCalledTimes(1);
});
test.each([false, true])(
    'simplification requires selected vector artwork (%s)',
    (eligible) => {
        const onSimplifyPaths = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        onSimplifyPaths,
                        canConvertToBitmap: eligible,
                    } as unknown as CanvasToolbarProps
                }
                openAction={jest.fn()}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const item = screen.getByRole('menuitem', { name: 'Simplify paths…' });
        if (eligible) expect(item).toBeEnabled();
        else expect(item).toBeDisabled();
        fireEvent.click(item);
        expect(onSimplifyPaths).toHaveBeenCalledTimes(eligible ? 1 : 0);
    },
);

test.each([false, true])(
    'Edit commands respect selection (%s)',
    (hasSelection) => {
        const onDeleteSelected = jest.fn(),
            onDuplicate = jest.fn(),
            onTrim = jest.fn();
        render(
            <ToolbarMenus
                props={
                    {
                        hasSelection,
                        hasGeometry: hasSelection,
                        onDeleteSelected,
                        onDuplicate,
                        onTrim,
                    } as unknown as CanvasToolbarProps
                }
                openAction={jest.fn()}
                close={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        for (const name of ['Trim', 'Clone', 'Delete']) {
            const item = screen.getByRole('menuitem', { name });
            if (hasSelection) expect(item).toBeEnabled();
            else expect(item).toBeDisabled();
            fireEvent.click(item);
        }
        expect(onTrim.mock.calls).toEqual(hasSelection ? [[]] : []);
        expect(onDuplicate.mock.calls).toEqual(hasSelection ? [[]] : []);
        expect(onDeleteSelected.mock.calls).toEqual(hasSelection ? [[]] : []);
    },
);
