import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
const workers: {
    postMessage: ReturnType<typeof jest.fn>;
    terminate: ReturnType<typeof jest.fn>;
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
}[] = [];
jest.unstable_mockModule('./timeEstimateWorker', () => ({
    createTimeEstimateWorker: () => {
        const worker = { postMessage: jest.fn(), terminate: jest.fn() };
        workers.push(worker);
        return worker;
    },
}));
const { LaserTimeEstimate } = await import('./LaserTimeEstimate');
beforeEach(() => {
    workers.length = 0;
    localStorage.clear();
});
function fill() {
    for (const axis of ['X', 'Y', 'Z']) {
        fireEvent.change(
            screen.getByLabelText(axis + ' Maximum speed (mm/min)'),
            { target: { value: '6000' } },
        );
        fireEvent.change(
            screen.getByLabelText(axis + ' Acceleration (mm/s²)'),
            { target: { value: '100' } },
        );
    }
}
function submit() {
    fireEvent.submit(
        screen
            .getByRole('button', { name: 'Estimate', hidden: true })
            .closest('form')!,
    );
}
const done = {
    seconds: 10.1,
    nominalSeconds: 10,
    dwellSeconds: 0,
    distanceMm: 100,
    moves: 1,
};

test('explicit machine assumptions are sent offline and saved after a successful estimate', () => {
    const { unmount } = render(
        <LaserTimeEstimate gcode="G1 X100 F600" dwell="P-seconds" />,
    );
    fireEvent.click(screen.getByText('Time estimate'));
    expect(screen.getByLabelText('X Maximum speed (mm/min)')).toHaveValue(null);
    fill();
    submit();
    expect(workers[0].postMessage).toHaveBeenCalledWith({
        gcode: 'G1 X100 F600',
        dwell: 'P-seconds',
        settings: {
            maxSpeed: [6000, 6000, 6000],
            acceleration: [100, 100, 100],
            start: [0, 0, 0],
            junctionDeviation: 0.01,
        },
    });
    act(() => workers[0].onmessage!({ data: { result: done } }));
    expect(screen.getByLabelText('Estimated job time')).toHaveTextContent(
        '0:00:11 estimated',
    );
    unmount();
    render(<LaserTimeEstimate gcode="G1 X1 F600" dwell="P-seconds" />);
    expect(screen.getByLabelText('X Maximum speed (mm/min)')).toHaveValue(6000);
});

test('cancellation, changed inputs and replacement suppress obsolete totals', () => {
    const { rerender, unmount } = render(
        <LaserTimeEstimate gcode="old" dwell="P-seconds" />,
    );
    fireEvent.click(screen.getByText('Time estimate'));
    fill();
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel estimate' }));
    act(() => workers[0].onmessage!({ data: { result: done } }));
    expect(screen.queryByLabelText('Estimated job time')).toBeNull();
    submit();
    rerender(<LaserTimeEstimate gcode="new" dwell="P-milliseconds" />);
    expect(workers[1].terminate).toHaveBeenCalled();
    act(() => workers[1].onmessage!({ data: { result: done } }));
    expect(screen.queryByLabelText('Estimated job time')).toBeNull();
    submit();
    act(() => workers[2].onmessage!({ data: { result: done } }));
    expect(screen.getByLabelText('Estimated job time')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Corner accuracy (mm)'), {
        target: { value: '0.1' },
    });
    expect(screen.queryByLabelText('Estimated job time')).toBeNull();
    submit();
    unmount();
    expect(workers[3].terminate).toHaveBeenCalled();
});
test('unsupported code and worker failures show no partial estimate', () => {
    render(<LaserTimeEstimate gcode="G53 X0" dwell="P-seconds" />);
    fireEvent.click(screen.getByText('Time estimate'));
    fill();
    submit();
    act(() => workers[0].onmessage!({ data: { error: 'Unsupported G53' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported G53');
    expect(screen.queryByLabelText('Estimated job time')).toBeNull();
    submit();
    act(() => workers[1].onerror!());
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to estimate');
});
