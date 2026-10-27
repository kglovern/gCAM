import { render, screen } from '@testing-library/react';
import { ChecksList } from './ChecksGcode';

test('planning is a status, while genuine failures explain the next action and retain diagnostics', () => {
    const view = render(
        <ChecksList
            flags={[{ level: 'e', msg: 'Planning mesh toolpaths...' }]}
        />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
        'Calculating toolpath',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    view.rerender(
        <ChecksList
            flags={[
                {
                    level: 'e',
                    msg: '964 STL faces are occluded or unresolved from these A setups.',
                },
            ]}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
        'This pass machines accessible surfaces',
    );
    expect(
        screen.getByRole('link', { name: 'Review model setup' }),
    ).toHaveAttribute('href', '#rotary-model-setup');
    expect(
        screen.getByText(
            '964 STL faces are occluded or unresolved from these A setups.',
        ),
    ).not.toBeVisible();
});
