import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToolpathWorkspace } from './ToolpathWorkspace';
import { mockMediaQuery } from '../test-stubs/media-query';
let media: ReturnType<typeof mockMediaQuery>;
afterEach(() => media.restore());
function workspace() {
    return (
        <ToolpathWorkspace
            selectedCount={1}
            rail={
                <div>
                    Cut settings
                    <input aria-label="Draft feed" defaultValue="100" />
                </div>
            }
        >
            <main>Canvas</main>
        </ToolpathWorkspace>
    );
}
test('narrow layout keeps the canvas available and opens/closes settings explicitly', () => {
    media = mockMediaQuery(true);
    render(workspace());
    expect(screen.getByText('Cut settings')).not.toBeVisible();
    const toggle = screen.getByRole('button', { name: 'Toolpath settings' });
    fireEvent.click(toggle);
    expect(screen.getByText('Cut settings')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft feed' }), {
        target: { value: '250' },
    });
    expect(
        screen.getByRole('button', { name: 'Close toolpath settings' }),
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Cut settings')).not.toBeVisible();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: 'Draft feed' })).toHaveValue(
        '250',
    );
    expect(screen.getByRole('main')).toHaveTextContent('Canvas');
});
test('rotation restores the desktop rail and keeps drawer state without replacing canvas', () => {
    media = mockMediaQuery(true);
    render(workspace());
    const canvas = screen.getByRole('main');
    act(() => media.change(false));
    expect(screen.getByText('Cut settings')).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Toolpath settings' }),
    ).not.toBeInTheDocument();
    act(() => media.change(true));
    expect(screen.getByText('Cut settings')).not.toBeVisible();
    expect(screen.getByRole('main')).toBe(canvas);
});
