import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { LaserSettingsTransfer } from './LaserSettingsTransfer';
import type { LaserSettingsSource } from './copy-laser-settings';

test('only explicit apply copies compatible settings, with feed checks and no geometry writes', () => {
    const args = {
        operation: 'laser-raster' as const,
        loops: [],
        toolDiameter: 1,
        cutDepth: 1,
        laserFeed: 1500,
    };
    const sources: LaserSettingsSource[] = [
        { id: 'one', label: 'Original', customLabel: 'Photo settings', args },
        { id: 'target', label: 'Target', args },
        {
            id: 'fill',
            label: 'Wrong type',
            args: { ...args, operation: 'laser-fill' },
        },
    ];
    const onApply = jest.fn();
    const view = render(
        <LaserSettingsTransfer
            sources={sources}
            currentId="target"
            operation="laser-raster"
            maxFeed={2000}
            onApply={onApply}
        />,
    );
    fireEvent.click(screen.getByText('Copy operation settings'));
    expect(
        screen.queryByRole('option', { name: 'Target' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('option', { name: 'Wrong type' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Apply settings' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Copy laser settings from'), {
        target: { value: 'one' },
    });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ feed: 1500 });
    expect(screen.getByRole('status')).toHaveTextContent('Settings copied');
    view.rerender(
        <LaserSettingsTransfer
            sources={sources}
            currentId="target"
            operation="laser-raster"
            maxFeed={1000}
            onApply={onApply}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('feed limit');
    expect(onApply).toHaveBeenCalledTimes(1);
});
