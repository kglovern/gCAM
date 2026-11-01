import { jest } from '@jest/globals';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    act,
} from '@testing-library/react';
const trace =
    jest.fn<
        (
            file: File,
            settings: unknown,
            signal: AbortSignal,
        ) => Promise<{ svg: string; paths: number }>
    >();
const save = jest.fn();
await jest.unstable_mockModule('../lib/batch-trace', () => ({
    batchSvgNames: (names: string[]) => names.map((name) => `${name}.svg`),
    traceFileToSvg: trace,
}));
await jest.unstable_mockModule('../platform/saveTextFile', () => ({
    saveTextFile: save,
}));
const { BatchTracePanel } = await import('./BatchTracePanel');
beforeEach(() => {
    trace.mockReset();
    save.mockReset();
});
test('a failed file does not block later files and completed SVGs save independently', async () => {
    trace
        .mockRejectedValueOnce(new Error('Bad image'))
        .mockResolvedValueOnce({ svg: '<svg/>', paths: 3 });
    render(<BatchTracePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: {
            files: [new File(['x'], 'bad.png'), new File(['y'], 'good.png')],
        },
    });
    await screen.findByRole('button', { name: 'Save good.png.svg' });
    expect(screen.getByText('Bad image')).toBeTruthy();
    expect(trace).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save good.png.svg' }));
    expect(save).toHaveBeenCalledWith(
        '<svg/>',
        'good.png.svg',
        'image/svg+xml',
    );
});
test('Stop aborts the active worker request and never starts queued files', async () => {
    let activeSignal: AbortSignal | undefined;
    trace.mockImplementation((_file, _settings, signal) => {
        activeSignal = signal;
        return new Promise((_resolve, reject) =>
            signal.addEventListener(
                'abort',
                () => reject(new DOMException('Stopped', 'AbortError')),
                { once: true },
            ),
        );
    });
    render(<BatchTracePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: {
            files: [new File(['x'], 'one.png'), new File(['y'], 'two.png')],
        },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(activeSignal?.aborted).toBe(true));
    expect(trace).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Stopped')).toHaveLength(2);
    expect(screen.queryByText('Save SVG')).toBeNull();
});
test('closing the panel aborts work without changing the project', async () => {
    let activeSignal: AbortSignal | undefined;
    trace.mockImplementation((_file, _settings, signal) => {
        activeSignal = signal;
        return new Promise(() => {});
    });
    const onClose = jest.fn();
    const { unmount } = render(<BatchTracePanel onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: { files: [new File(['x'], 'one.png')] },
    });
    fireEvent.click(screen.getByLabelText('Close batch trace'));
    expect(activeSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
});

test('a stopped job cannot overwrite a newer batch when decoding finishes late', async () => {
    let finish: (result: { svg: string; paths: number }) => void = () => {};
    trace
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        )
        .mockResolvedValueOnce({ svg: '<svg/>', paths: 1 });
    render(<BatchTracePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: { files: [new File(['old'], 'old.png')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: { files: [new File(['new'], 'new.png')] },
    });
    await screen.findByRole('button', { name: 'Save new.png.svg' });
    await act(async () => finish({ svg: '<svg>old</svg>', paths: 99 }));
    expect(screen.queryByText('old.png')).toBeNull();
    expect(
        screen.getByRole('button', { name: 'Save new.png.svg' }),
    ).toBeTruthy();
});

test('oversized file batches fail before starting any worker', () => {
    render(<BatchTracePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Images to trace'), {
        target: {
            files: Array.from(
                { length: 51 },
                (_, i) => new File(['x'], `${i}.png`),
            ),
        },
    });
    expect(screen.getByRole('alert').textContent).toContain('50 images');
    expect(trace).not.toHaveBeenCalled();
});
