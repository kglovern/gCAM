import { jest } from '@jest/globals';
import React, { forwardRef, useImperativeHandle } from 'react';
import { act, render, screen } from '@testing-library/react';

const viewer = {
    loadFromText: jest.fn(),
    loadFromSegments: jest.fn(async () => {}),
    unload: jest.fn(),
    getBounds: jest.fn(() => null),
    focusToModel: jest.fn(),
};
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
    expect(workers[0].postMessage).toHaveBeenCalledWith('G1 X1 F100');
    await act(() => workers[0].onmessage({ data: { progress: 42 } }));
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    const data = {
        format: 'segments-v1',
        chunks: [],
        totalVertices: 0,
        prefixEndVertex: new ArrayBuffer(0),
    };
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
