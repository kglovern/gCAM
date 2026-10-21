import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolbarMenu, ToolbarMenuItem } from './ToolbarControls';
test('menus dismiss on selection, outside pointer and Escape without hover', () => {
    const action = jest.fn();
    render(
        <ToolbarMenu label="Actions">
            <ToolbarMenuItem label="Choose" onClick={action} />
        </ToolbarMenu>,
    );
    const toggle = screen.getByRole('button', { name: 'Actions' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    fireEvent.pointerDown(document.body);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
});
