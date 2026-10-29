import { fireEvent, render, screen } from '@testing-library/react';
import { JobStockSetup } from './JobStockSetup';
import { DEFAULT_JOB_STOCK } from './stock';

const props = {
    units: 'metric' as const,
    onChange: () => {},
    maxXTravelMm: 1260,
    maxYTravelMm: 1248,
    machineName: 'AltMill MK2 4x4',
};

test('shows stock dimension units in the selected measurement system', () => {
    const { rerender } = render(
        <JobStockSetup stock={DEFAULT_JOB_STOCK} {...props} />,
    );

    expect(screen.getByLabelText('Stock Width (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Stock Thickness (mm)')).toBeInTheDocument();

    rerender(
        <JobStockSetup stock={DEFAULT_JOB_STOCK} {...props} units="imperial" />,
    );
    expect(screen.getByLabelText('Stock Width (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Stock Thickness (in)')).toBeInTheDocument();
});

test('describes bed-sized stock as a starting guide and switches to actual-stock wording after resize', () => {
    const bedStock = {
        ...DEFAULT_JOB_STOCK,
        widthMm: 1260,
        heightMm: 1248,
    };
    const { rerender } = render(<JobStockSetup stock={bedStock} {...props} />);

    expect(
        screen.getByText(
            /Starting stock is set to AltMill MK2 4x4's full working area/,
        ),
    ).toBeInTheDocument();

    rerender(<JobStockSetup stock={DEFAULT_JOB_STOCK} {...props} />);
    expect(
        screen.getByText(
            /Set these dimensions to match the material fixed on your CNC/,
        ),
    ).toBeInTheDocument();
    expect(
        screen.queryByText(/Starting stock is set to/),
    ).not.toBeInTheDocument();
});

test('stock origin can be changed independently of material dimensions', () => {
    let changed = DEFAULT_JOB_STOCK;
    render(
        <JobStockSetup
            stock={DEFAULT_JOB_STOCK}
            {...props}
            onChange={(stock) => {
                changed = stock;
            }}
        />,
    );
    fireEvent.change(screen.getByLabelText('Stock origin'), {
        target: { value: 'center' },
    });
    expect(changed).toEqual({ ...DEFAULT_JOB_STOCK, origin: 'center' });
});
