import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SurfaceUnitsModal } from './SurfaceUnitsModal';

test('requires a clear STL/OBJ unit choice before continuing', () => {
    const onApply = jest.fn();
    render(
        <SurfaceUnitsModal
            fileName="part.stl"
            sizeMm={{ x: 50, y: 25, z: 10 }}
            onApply={onApply}
            onCancel={() => {}}
        />,
    );

    expect(
        screen.getByText(/original units, then check the size/i),
    ).toBeInTheDocument();
    expect(
        screen.getByText('Millimetres: 50.0 × 25.0 × 10.0 mm'),
    ).toBeInTheDocument();
    expect(
        screen.getByText('Inches: 1270.0 × 635.0 × 254.0 mm'),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Continue to model setup' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Model units'), {
        target: { value: 'inch' },
    });
    fireEvent.click(
        screen.getByRole('button', { name: 'Continue to model setup' }),
    );

    expect(onApply).toHaveBeenCalledWith('inch');
});

test('model setup only asks for units and keeps the caller workspace context', () => {
    const apply = jest.fn();
    render(
        <SurfaceUnitsModal
            fileName="queen.stl"
            sizeMm={{ x: 32, y: 32, z: 60 }}
            onApply={apply}
            onCancel={() => {}}
        />,
    );
    expect(screen.queryByText('How will you machine it?')).toBeNull();
    expect(screen.queryByRole('radio', { name: /Rotary/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Model units'), {
        target: { value: 'mm' },
    });
    fireEvent.click(
        screen.getByRole('button', { name: 'Continue to model setup' }),
    );
    expect(apply).toHaveBeenCalledWith('mm');
});
