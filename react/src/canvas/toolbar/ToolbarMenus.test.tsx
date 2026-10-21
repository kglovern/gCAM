import { jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ToolbarMenus } from './ToolbarMenus';
import type { CanvasToolbarProps } from './types';

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

    const fileButton = screen.getByRole('button', { name: 'File' });
    const menu = fileButton.parentElement?.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const fileMenu = within(menu as HTMLElement);
    const items = fileMenu.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
        'New Project',
        'Import File',
        'Import Project',
        'Export Project',
        'Export G-code',
    ]);
    expect(fileMenu.getAllByRole('separator')).toHaveLength(2);

    fireEvent.click(fileMenu.getByRole('menuitem', { name: 'Import File' }));
    expect(onImportFile).toHaveBeenCalledTimes(1);
});
