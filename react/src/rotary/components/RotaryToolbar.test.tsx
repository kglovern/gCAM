import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RotaryToolbar } from './RotaryToolbar';
import type { UseRotaryState } from '../useRotaryState';
import type { CanvasToolbarProps } from '../../canvas/toolbar/types';
test('Open File in Rotary loads the rotary model without using the normal toolpath importer', async () => {
    const importStlFile = jest
        .fn<UseRotaryState['importStlFile']>()
        .mockResolvedValue(undefined);
    const normalImport = jest.fn();
    render(
        <RotaryToolbar
            rotary={
                {
                    importStlFile,
                    points: [],
                    canUndo: false,
                    canRedo: false,
                } as unknown as UseRotaryState
            }
            commands={
                { onImportFile: normalImport } as unknown as CanvasToolbarProps
            }
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const names = screen
        .getAllByRole('menuitem')
        .map((item) => item.textContent);
    expect(names.indexOf('New Project') + 1).toBe(
        names.indexOf('Import Project'),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open File' }));
    const input = screen.getByLabelText('Import rotary STL file');
    expect(input).toHaveAttribute('accept', '.stl');
    const file = new File(['model'], 'rotary.stl');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(importStlFile).toHaveBeenCalledWith(file));
    expect(normalImport).not.toHaveBeenCalled();
    expect(screen.queryByText('How will you machine it?')).toBeNull();
});
