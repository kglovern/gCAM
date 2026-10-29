import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnitInput } from './UnitInput';

test('leaving an unchanged input does not rebuild its toolpath or round stored inches', () => {
    const change = jest.fn();
    render(
        <UnitInput
            aria-label="Length"
            units="imperial"
            valueMm={3.175}
            onChangeMm={change}
        />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Length' });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(change).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0.25' } });
    expect(change).toHaveBeenCalledWith(6.35);
});

test('exact fractional sizes remain valid with an arbitrary numeric step', () => {
    render(
        <UnitInput
            aria-label="Radius"
            units="imperial"
            valueMm={3.175}
            minMm={0}
            stepMm="any"
            onChangeMm={jest.fn()}
        />,
    );
    const input = screen.getByLabelText('Radius');
    expect(input.value).toBe('0.125');
    expect(input.checkValidity()).toBe(true);
});
