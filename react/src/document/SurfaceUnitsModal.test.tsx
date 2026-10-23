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

test('an STL can go directly to rotary with explicit units instead of the flat-bed flow', () => {
    const flat = jest.fn(),
        rotary = jest.fn();
    render(
        <SurfaceUnitsModal
            fileName="queen.stl"
            sizeMm={{ x: 32, y: 32, z: 60 }}
            onApply={flat}
            onRotary={rotary}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Model units'), {
        target: { value: 'mm' },
    });
    expect(
        screen.getByRole('button', { name: 'Continue to model setup' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Rotary/ }));
    fireEvent.click(
        screen.getByRole('button', { name: 'Continue to model setup' }),
    );
    expect(rotary).toHaveBeenCalledWith('mm');
    expect(flat).not.toHaveBeenCalled();
});
