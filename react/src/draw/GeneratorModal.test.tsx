import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { GeneratorModal } from './GeneratorModal';
test('clock shows font selector and inch diameter and cancel never adds geometry', async () => {
    const add = jest.fn(),
        cancel = jest.fn();
    render(
        <GeneratorModal
            kind="clock"
            units="imperial"
            onClose={cancel}
            onAdd={add}
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Text font' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Diameter (in)')).toBeInTheDocument();
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Add Clock Face' }),
        ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
});
