import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { FontPicker } from './FontPicker';

test('shows actual outline and stroke samples and selects without submitting', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn((event: React.FormEvent) =>
        event.preventDefault(),
    );
    render(
        <form onSubmit={onSubmit}>
            <FontPicker value="single-line" onChange={onChange} className="" />
        </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text font' }));
    const engraving = screen.getByRole('option', {
        name: 'Single Line Engraving',
    });
    expect(engraving.querySelector('svg path')).toHaveAttribute(
        'd',
        expect.stringContaining('M'),
    );
    const anton = screen.getByRole('option', { name: 'Anton' });
    expect(anton.querySelector('[style]')).toHaveStyle({
        fontFamily: '"Anton", sans-serif',
    });
    fireEvent.click(anton);
    expect(onChange).toHaveBeenCalledWith('anton');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
});
