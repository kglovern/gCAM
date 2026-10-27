import { fireEvent, render, screen } from '@testing-library/react';
import { ToolpathWorkspace } from './ToolpathWorkspace';

test('keeps settings visible and preserves the draft when selection actions change', () => {
    const workspace = (actions?: React.ReactNode) => (
        <ToolpathWorkspace
            rail={<input aria-label="Draft feed" defaultValue="100" />}
            actions={actions}
        >
            <main>Canvas</main>
        </ToolpathWorkspace>
    );
    const { rerender } = render(workspace());
    const canvas = screen.getByRole('main');
    const feed = screen.getByRole('textbox', { name: 'Draft feed' });
    expect(
        screen.getByRole('region', { name: 'Toolpath settings panel' }),
    ).toBeVisible();
    fireEvent.change(feed, { target: { value: '250' } });
    rerender(workspace(<button type="button">Properties</button>));
    expect(screen.getByRole('main')).toBe(canvas);
    expect(screen.getByRole('textbox', { name: 'Draft feed' })).toBe(feed);
    expect(feed).toHaveValue('250');
    expect(
        screen.queryByRole('button', { name: 'Toolpath settings' }),
    ).not.toBeInTheDocument();
});
