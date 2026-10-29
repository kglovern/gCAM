import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useConfirmation } from './ConfirmDialog';

function Harness({ done }: { done(value: boolean): void }) {
    const { confirm, dialog } = useConfirmation();
    return (
        <>
            <button
                onClick={async () =>
                    done(
                        await confirm({
                            title: 'Delete shapes?',
                            message: 'Undo is available.',
                            rememberKey: 'gcam.skipShapeDeletionWarning',
                        }),
                    )
                }
            >
                Delete shapes
            </button>
            <button
                onClick={async () =>
                    done(
                        await confirm({
                            title: 'Delete toolpath?',
                            message: 'Confirm separately.',
                        }),
                    )
                }
            >
                Delete toolpath
            </button>
            {dialog}
        </>
    );
}
beforeEach(() => localStorage.clear());
test('remembering shape deletion skips later shape warnings only', async () => {
    const done = jest.fn();
    render(<Harness done={done} />);
    fireEvent.click(screen.getByText('Delete shapes'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Don’t show again' }));
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(done).toHaveBeenCalledWith(true));
    expect(localStorage.getItem('gcam.skipShapeDeletionWarning')).toBe('true');
    fireEvent.click(screen.getByText('Delete shapes'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByText('Delete toolpath'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});
test('cancelling does not save the suppression checkbox', () => {
    render(<Harness done={jest.fn()} />);
    fireEvent.click(screen.getByText('Delete shapes'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(localStorage.getItem('gcam.skipShapeDeletionWarning')).toBeNull();
});
