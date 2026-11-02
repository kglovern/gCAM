import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ToolpathStackEntry } from './useToolpathStack';
const jobs: {
    resolve: (code: string) => void;
    cancel: ReturnType<typeof jest.fn>;
}[] = [];
const build = jest.fn(() => {
    let resolve!: (code: string) => void, reject!: (error: Error) => void;
    const promise = new Promise<string>((a, b) => {
        resolve = a;
        reject = b;
    });
    const cancel = jest.fn(() =>
        reject(new DOMException('Cancelled', 'AbortError')),
    );
    jobs.push({ resolve, cancel });
    return { promise, cancel };
});
jest.unstable_mockModule('../engine/cam-worker-client', () => ({
    exportProgramInWorker: build,
}));
const { GcodeExportButton } = await import('./GcodeExportButton');
const originalWorker = globalThis.Worker,
    originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
const entry = {
    id: 'image',
    label: 'Image',
    args: { operation: 'laser-raster', loops: [] },
    preview: [],
    toolpath: { operation: 'laser-raster' },
} as unknown as ToolpathStackEntry;
const props = {
    gcode: '',
    fileName: 'image',
    stack: [entry],
    units: 'metric' as const,
    emitArcs: false,
};
let click: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
    jobs.length = 0;
    build.mockClear();
    globalThis.Worker = class {} as unknown as typeof Worker;
    URL.createObjectURL = jest.fn(() => 'blob:test');
    URL.revokeObjectURL = jest.fn();
    click = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
});
afterEach(() => {
    globalThis.Worker = originalWorker;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    click.mockRestore();
});
const start = async () => {
    await act(async () => {
        fireEvent.click(
            screen.getByRole('button', { name: 'Export individual toolpaths' }),
        );
    });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '1. Image' }));
    });
};
test('stale individual jobs reject before a worker or file is created', async () => {
    render(
        <GcodeExportButton
            {...props}
            validateEntry={() => 'Linked mask changed'}
        />,
    );
    await start();
    expect(build).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Linked mask changed');
});
test('an individual program is checked again after asynchronous preparation', async () => {
    const { rerender } = render(
        <GcodeExportButton {...props} validateEntry={() => ''} />,
    );
    await start();
    expect(build).toHaveBeenCalledTimes(1);
    rerender(
        <GcodeExportButton
            {...props}
            validateEntry={() => 'Toolpath changed'}
        />,
    );
    await act(async () => jobs[0].resolve('G1 X10 S500'));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Toolpath changed');
});
test('unmount terminates unfinished individual export and no file appears', async () => {
    const { unmount } = render(
        <GcodeExportButton {...props} validateEntry={() => ''} />,
    );
    await start();
    await act(async () => unmount());
    expect(jobs[0].cancel).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
});
test('valid individual jobs remain exportable while the combined program is unavailable', async () => {
    render(<GcodeExportButton {...props} validateEntry={() => ''} />);
    await start();
    await act(async () => jobs[0].resolve('G1 X10 S500'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
