import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
const jobs: {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    cancel: ReturnType<typeof jest.fn>;
}[] = [];
const process = jest.fn(() => {
    let resolve!: (value: unknown) => void, reject!: (e: Error) => void;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    const cancel = jest.fn();
    jobs.push({ resolve, reject, cancel });
    return { promise, cancel };
});
jest.unstable_mockModule('../engine/cam-worker-client', () => ({
    processLaserImageInWorker: process,
}));
jest.unstable_mockModule('./LaserImageCompare', () => ({
    LaserImageCompare: ({
        cache,
        invert,
        onInvert,
    }: {
        cache: { width: number } | null;
        invert: boolean;
        onInvert(value: boolean): void;
    }) => (
        <div>
            <span>{cache ? `Preview ${cache.width}` : 'No preview'}</span>
            <button onClick={() => onInvert(!invert)}>
                {invert ? 'Display inverted' : 'Invert display'}
            </button>
        </div>
    ),
}));
const { LaserImageAdjust } = await import('./LaserImageAdjust');
const getContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
    jobs.length = 0;
    process.mockClear();
    jest.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
        createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: jest.fn(),
    })) as unknown as typeof getContext;
});
afterEach(() => {
    jest.useRealTimers();
    HTMLCanvasElement.prototype.getContext = getContext;
});
const ready = (width = 2) => ({
    width,
    height: 2,
    widthMm: 2,
    heightMm: 2,
    data: new Uint8ClampedArray(width * 2 * 4).fill(255),
});
const setup = () => {
    const onApply = jest.fn(),
        onClose = jest.fn();
    const view = render(
        <LaserImageAdjust
            bitmap={{
                bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 },
                imageData: {
                    width: 2,
                    height: 2,
                    data: new Uint8ClampedArray(16),
                },
            }}
            source={new Image()}
            units="metric"
            settings={{
                gamma: 1,
                interval: 1,
                options: { imageMode: 'grayscale' },
            }}
            onApply={onApply}
            onClose={onClose}
        />,
    );
    return { ...view, onApply, onClose };
};
test('superseded processing is cancelled and a stale result cannot enable Apply', async () => {
    const { onApply } = setup();
    act(() => jest.advanceTimersByTime(120));
    expect(process).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Adjustment gamma'), {
        target: { value: '1.5' },
    });
    expect(jobs[0].cancel).toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(120));
    await act(async () => {
        jobs[0].resolve(ready(9));
        await Promise.resolve();
    });
    expect(screen.queryByText('Preview 9')).not.toBeInTheDocument();
    expect(screen.getByText('Apply image settings')).toBeDisabled();
    await act(async () => {
        jobs[1].resolve(ready());
        await Promise.resolve();
    });
    expect(screen.getByText('Apply image settings')).toBeEnabled();
    fireEvent.click(screen.getByText('Apply image settings'));
    expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
            gamma: 1.5,
            interval: 1,
            options: { imageMode: 'grayscale' },
        }),
    );
});
test('display inversion does not reprocess pixels or change output settings', async () => {
    const { onApply } = setup();
    act(() => jest.advanceTimersByTime(120));
    await act(async () => {
        jobs[0].resolve(ready());
        await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Invert display'));
    expect(screen.getByText('Display inverted')).toBeInTheDocument();
    expect(process).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Apply image settings'));
    expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ options: { imageMode: 'grayscale' } }),
    );
});
test('close cancels work and errors leave Apply disabled', async () => {
    const { unmount, onClose, onApply } = setup();
    act(() => jest.advanceTimersByTime(120));
    await act(async () => {
        jobs[0].reject(new Error('Invalid gamma'));
        await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid gamma');
    expect(screen.getByText('Apply image settings')).toBeDisabled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(jobs[0].cancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
});
