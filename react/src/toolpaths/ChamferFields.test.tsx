import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChamferFields } from './ChamferFields';
test('displays converted lengths and reports dimensions in millimetres', () => {
    const onWidth = jest.fn(),
        onTipOffset = jest.fn();
    render(
        <ChamferFields
            width={2.54}
            tipOffset={1.27}
            angle={90}
            diameter={15}
            units="imperial"
            onWidth={onWidth}
            onTipOffset={onTipOffset}
        />,
    );
    expect(screen.getByLabelText('Chamfer width')).toHaveValue(0.1);
    fireEvent.change(screen.getByLabelText('Chamfer width'), {
        target: { value: '0.2' },
    });
    expect(onWidth).toHaveBeenCalledWith(5.08);
    fireEvent.change(screen.getByLabelText('Chamfer tip offset'), {
        target: { value: '0.1' },
    });
    expect(onTipOffset).toHaveBeenCalledWith(2.54);
    expect(screen.getByText(/Tip depth:/)).toHaveTextContent('0.15in');
});
test('legacy jobs require explicit conversion instead of silently changing their path', () => {
    const onWidth = jest.fn();
    render(
        <ChamferFields
            width={null}
            tipOffset={0.25}
            angle={90}
            diameter={6}
            units="metric"
            onWidth={onWidth}
            onTipOffset={jest.fn()}
        />,
    );
    expect(screen.queryByLabelText('Chamfer width')).not.toBeInTheDocument();
    expect(onWidth).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use edge width' }));
    expect(onWidth).toHaveBeenCalledWith(0.5);
});
