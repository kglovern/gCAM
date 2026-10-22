import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { UpdateControls } from './UpdateControls';
import type { UpdateState } from './store';

test('keeps browser UI quiet and only offers desktop download/restart after update events', async () => {
    const browser = render(<UpdateControls notice />);
    expect(
        screen.queryByLabelText('Application updates'),
    ).not.toBeInTheDocument();
    browser.unmount();
    let notify: (state: UpdateState) => void = () => {};
    const download = jest.fn(async () => ({ phase: 'ready' as const }));
    const install = jest.fn(async () => ({ phase: 'ready' as const }));
    window.gcamUpdates = {
        status: async () => ({ phase: 'current', currentVersion: '0.1.0' }),
        check: async () => ({ phase: 'current' }),
        download,
        install,
        subscribe: (callback) => {
            notify = callback;
            return () => {};
        },
    };
    try {
        render(<UpdateControls notice />);
        await act(async () => {});
        expect(
            screen.queryByLabelText('Application updates'),
        ).not.toBeInTheDocument();
        act(() => notify({ phase: 'available', version: '0.2.0' }));
        expect(screen.getByRole('status')).toHaveTextContent('0.2.0');
        expect(download).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Download update' }),
        );
        await screen.findByRole('button', { name: 'Restart to update' });
        expect(install).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Save your project',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Restart to update' }),
        );
        await act(async () => {});
        expect(install).toHaveBeenCalledTimes(1);
    } finally {
        delete window.gcamUpdates;
    }
});
