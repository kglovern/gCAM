import { StrictMode, useState } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ScanAlignmentFields } from './ScanAlignmentFields';
import { saveScanAlignment, type ScanAlignment } from './scan-alignment';
import { DEFAULT_JOB_STOCK } from '../job/stock';

const a = {
    enabled: true,
    measurements: [
        { feed: 1000, gap: 0.2 },
        { feed: 3000, gap: 0.6 },
    ],
};
const b = {
    enabled: true,
    measurements: [
        { feed: 1000, gap: -0.2 },
        { feed: 3000, gap: -0.6 },
    ],
};
function Job({
    device,
    initial,
    editing = false,
}: {
    device: string;
    initial?: ScanAlignment;
    editing?: boolean;
}) {
    const [value, onChange] = useState(initial);
    return (
        <>
            <ScanAlignmentFields
                device={device}
                value={value}
                onChange={onChange}
                editing={editing}
                units="metric"
                feed={2000}
                stock={DEFAULT_JOB_STOCK}
                overscan={2.5}
            />
            <output data-testid="calibration">{JSON.stringify(value)}</output>
        </>
    );
}
test('new jobs load device calibration; changing device loads its own table', async () => {
    localStorage.clear();
    saveScanAlignment('a', a);
    saveScanAlignment('b', b);
    const view = render(
        <StrictMode>
            <Job device="a" />
        </StrictMode>,
    );
    await waitFor(() =>
        expect(screen.getByTestId('calibration')).toHaveTextContent(
            '"gap":0.6',
        ),
    );
    view.rerender(
        <StrictMode>
            <Job device="b" />
        </StrictMode>,
    );
    await waitFor(() =>
        expect(screen.getByTestId('calibration')).toHaveTextContent(
            '"gap":-0.6',
        ),
    );
});
test('opening a saved job retains its calibration snapshot even when device preferences differ', async () => {
    localStorage.clear();
    saveScanAlignment('a', a);
    render(
        <StrictMode>
            <Job device="a" initial={b} editing />
        </StrictMode>,
    );
    await waitFor(() =>
        expect(screen.getByTestId('calibration')).toHaveTextContent(
            '"gap":-0.6',
        ),
    );
    expect(loadSnapshot()).toEqual(b);
});
const loadSnapshot = () =>
    JSON.parse(screen.getByTestId('calibration').textContent || '{}');

test('malformed project calibration is shown with an explicit reset instead of crashing the form', () => {
    render(
        <Job
            device="invalid"
            initial={
                {
                    enabled: true,
                    measurements: null,
                } as unknown as ScanAlignment
            }
            editing
        />,
    );
    expect(
        screen.getByText('Invalid scan alignment settings.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reset scan alignment'));
    expect(loadSnapshot()).toEqual({ enabled: false, measurements: [] });
});
