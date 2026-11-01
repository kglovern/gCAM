import { jest } from '@jest/globals';
import React, { forwardRef, useImperativeHandle } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';

const viewer = {
    loadFromText: jest.fn(),
    loadFromSegments: jest.fn(async () => {}),
    unload: jest.fn(),
    getBounds: jest.fn(() => null),
    focusToModel: jest.fn(),
    resize: jest.fn(),
    setOptions: jest.fn(),
    getOptions: jest.fn(() => ({ bit: {} })),
    seekToLine: jest.fn(),
    showAll: jest.fn(),
    resetColors: jest.fn(),
    setBitVisible: jest.fn(),
    setBitPosition: jest.fn(),
    setBitSpinning: jest.fn(),
};
const segments = () => ({
    format: 'segments-v1',
    chunks: [
        {
            positions: new Float32Array([0, 0, 0, 10, 0, 0]).buffer,
            vertexCount: 2,
        },
    ],
    totalVertices: 2,
    prefixEndVertex: new Uint32Array([0, 2]).buffer,
});
const workers = [];
jest.unstable_mockModule('@sienci/gviewer/react', () => ({
    GCodeVisualizer: forwardRef((_, ref) => {
        useImperativeHandle(ref, () => viewer);
        return React.createElement('canvas');
    }),
}));
jest.unstable_mockModule('@sienci/gviewer/viewer', () => ({
    gCodeViewerThemePresets: { light: {}, 'tokyo-night': {} },
}));
jest.unstable_mockModule('./gcodePreviewWorker', () => ({
    createGcodePreviewWorker: () => {
        const worker = { postMessage: jest.fn(), terminate: jest.fn() };
        workers.push(worker);
        return worker;
    },
}));
const { GcodeViewer3DView } = await import('./GcodeViewer3DView');
beforeEach(() => {
    jest.clearAllMocks();
    workers.length = 0;
});

test('parses in a worker, displays progress and uploads final buffers only', async () => {
    render(<GcodeViewer3DView gcode="G1 X1 F100" darkMode={false} />);
    expect(workers[0].postMessage).toHaveBeenCalledWith({
        gcode: 'G1 X1 F100',
        laser: undefined,
        laserMax: undefined,
    });
    await act(() => workers[0].onmessage({ data: { progress: 42 } }));
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    const data = segments();
    await act(() => workers[0].onmessage({ data: { data } }));
    expect(viewer.loadFromText).not.toHaveBeenCalled();
    expect(viewer.loadFromSegments).toHaveBeenCalledWith(data);
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(screen.getByText(/Drag to orbit/)).toBeInTheDocument();
});

test('cancels obsolete parsing and never displays its result', async () => {
    const { rerender, unmount } = render(
        <GcodeViewer3DView gcode="old" darkMode={false} />,
    );
    rerender(<GcodeViewer3DView gcode="new" darkMode={false} />);
    expect(workers[0].terminate).toHaveBeenCalled();
    await act(() => workers[0].onmessage({ data: { data: {} } }));
    expect(viewer.loadFromSegments).not.toHaveBeenCalled();
    unmount();
    expect(workers[1].terminate).toHaveBeenCalled();
});

test('a worker failure clears the stale preview and shows an error', async () => {
    render(<GcodeViewer3DView gcode="G1 X1" darkMode={false} />);
    await act(() => workers[0].onerror());
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(viewer.unload).toHaveBeenCalled();
    expect(
        screen.getByText('Unable to render this G-code.'),
    ).toBeInTheDocument();
});

test('sets laser mode before segment upload and exposes fitting only after a rendered frame', async () => {
    const frames = [];
    const frame = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
            frames.push(callback);
            return frames.length;
        });
    try {
        render(
            <GcodeViewer3DView
                gcode="M4 S1000\nG1 X10"
                darkMode={false}
                laser
            />,
        );
        expect(screen.getByRole('button', { name: 'Fit view' })).toBeDisabled();
        let pending;
        await act(async () => {
            pending = workers[0].onmessage({
                data: { data: { ...segments(), isLaser: true } },
            });
            await Promise.resolve();
        });
        expect(viewer.setOptions.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                mode: { laser: true, sim3d: false },
                bit: expect.objectContaining({
                    type: 'crosshair',
                    colorSource: 'custom',
                }),
            }),
        );
        expect(viewer.setOptions.mock.invocationCallOrder[0]).toBeLessThan(
            viewer.loadFromSegments.mock.invocationCallOrder[0],
        );
        expect(viewer.resize).toHaveBeenCalled();
        expect(screen.queryByText(/Drag to orbit/)).not.toBeInTheDocument();
        await act(async () => frames.shift()(0));
        expect(screen.getByRole('button', { name: 'Fit view' })).toBeDisabled();
        await act(async () => {
            frames.shift()(16);
            await pending;
        });
        expect(screen.getByRole('button', { name: 'Fit view' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Fit view' }));
        expect(viewer.focusToModel).toHaveBeenCalledTimes(2);
        await act(async () => {
            frames.shift()(32);
            frames.shift()(48);
        });
        expect(screen.getByRole('button', { name: 'Fit view' })).toBeEnabled();
    } finally {
        frame.mockRestore();
    }
});

test('empty motion leaves preview controls disabled', async () => {
    render(<GcodeViewer3DView gcode="M5" darkMode={false} />);
    await act(() =>
        workers[0].onmessage({
            data: {
                data: {
                    chunks: [],
                    totalVertices: 0,
                    prefixEndVertex: new ArrayBuffer(0),
                },
            },
        }),
    );
    expect(screen.getByText('No motion to preview.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fit view' })).toBeDisabled();
});

test('uploads worker-planned geometry directly without starting another parser', async () => {
    const { estimateProgramTime } = await import('../gcode/estimateTime');
    const { prepareTimedPreview } = await import(
        '../engine/prepare-timed-preview'
    );
    const code = 'M4 S1000\nG1 X100 F600';
    const result = await estimateProgramTime(
        code,
        {
            maxSpeed: [6000, 6000, 6000],
            acceleration: [100, 100, 100],
            start: [0, 0, 0],
            junctionDeviation: 0.01,
        },
        'P-seconds',
        () => {},
        true,
    );
    const preview = await prepareTimedPreview(code, result.playback);
    render(
        <GcodeViewer3DView
            gcode={code}
            darkMode={false}
            laser
            timedPreview={preview}
        />,
    );
    await waitFor(() =>
        expect(screen.getByLabelText('Preview time')).toBeEnabled(),
    );
    expect(workers).toHaveLength(0);
    expect(viewer.loadFromSegments).toHaveBeenCalledWith(preview.geometry);
    expect(screen.getByLabelText('Preview time')).toBeEnabled();
    expect(screen.getByLabelText('Preview speed multiplier')).toHaveValue('1');
});
