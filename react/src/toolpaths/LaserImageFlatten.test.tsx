import { jest } from '@jest/globals';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { flattenImageRegion } from '../lib/flatten-image';
const jobs: {
    resolve: (value: ReturnType<typeof flattenImageRegion>) => void;
    cancel: ReturnType<typeof jest.fn>;
}[] = [];
const process = jest.fn(
    (_request: import('../lib/flatten-image').FlattenImageRequest) => {
        let resolve!: (value: ReturnType<typeof flattenImageRegion>) => void;
        const promise = new Promise<ReturnType<typeof flattenImageRegion>>(
            (done) => {
                resolve = done;
            },
        );
        const cancel = jest.fn();
        jobs.push({ resolve, cancel });
        return { promise, cancel };
    },
);
const encode = jest.fn(() =>
    Promise.resolve(new Blob(['PNG'], { type: 'image/png' })),
);
jest.unstable_mockModule('../engine/cam-worker-client', () => ({
    flattenImageInWorker: process,
}));
jest.unstable_mockModule('../lib/bitmap', () => ({
    imageDataOf: () => ({
        width: 4,
        height: 4,
        data: new Uint8ClampedArray(64).fill(255),
    }),
}));
jest.unstable_mockModule('../platform/processedImagePng', () => ({
    processedImagePng: encode,
}));
const { LaserImageFlatten } = await import('./LaserImageFlatten');
const originalDecode = HTMLImageElement.prototype.decode;
beforeEach(() => {
    jobs.length = 0;
    process.mockClear();
    encode.mockClear();
    HTMLImageElement.prototype.decode = jest.fn(() => Promise.resolve());
});
afterEach(() => {
    HTMLImageElement.prototype.decode = originalDecode;
});
const source = () => {
    const img = new Image();
    Object.defineProperties(img, {
        naturalWidth: { value: 4 },
        naturalHeight: { value: 4 },
    });
    return {
        id: 'bitmap',
        x: 0,
        y: 0,
        w: 40,
        h: 40,
        dataUrl: 'source pixels',
        img,
    };
};
const result = () =>
    flattenImageRegion({
        image: {
            width: 4,
            height: 4,
            data: new Uint8ClampedArray(64).fill(255),
        },
        placement: { x: 0, y: 0, w: 40, h: 40 },
        crop: { left: 0, bottom: 0, right: 0.5, top: 1 },
    });
test('preview stages a native RGBA result and only explicit replacement commits it', async () => {
    const bitmap = source(),
        onCommit = jest.fn(),
        onClose = jest.fn();
    render(
        <LaserImageFlatten
            bitmap={bitmap}
            shapes={[]}
            options={{ imageCrop: { left: 0, bottom: 0, right: 0.5, top: 1 } }}
            onCommit={onCommit}
            onClose={onClose}
        />,
    );
    expect(process.mock.calls[0][0]).toMatchObject({
        placement: { x: 0, y: 0, w: 40, h: 40 },
    });
    expect(process.mock.calls[0][0].placement).not.toHaveProperty('img');
    expect(
        screen.getByRole('button', { name: 'Replace with flattened image' }),
    ).toBeDisabled();
    await act(async () => jobs[0].resolve(result()));
    await waitFor(() =>
        expect(
            screen.getByRole('button', {
                name: 'Replace with flattened image',
            }),
        ).toBeEnabled(),
    );
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Replace with flattened image' }),
    );
    expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
            source: bitmap,
            dataUrl: expect.stringContaining('data:image/png;base64,'),
            result: expect.objectContaining({ width: 2, height: 4 }),
        }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
});
test('unmount cancels processing and ignores its late result', async () => {
    const onCommit = jest.fn();
    const { unmount } = render(
        <LaserImageFlatten
            bitmap={source()}
            shapes={[]}
            options={{}}
            onCommit={onCommit}
            onClose={() => {}}
        />,
    );
    unmount();
    expect(jobs[0].cancel).toHaveBeenCalledTimes(1);
    await act(async () => jobs[0].resolve(result()));
    expect(encode).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
});
test('stale-source rejection is displayed without closing or committing another result', async () => {
    const onClose = jest.fn();
    render(
        <LaserImageFlatten
            bitmap={source()}
            shapes={[]}
            options={{}}
            onCommit={() => {
                throw new Error('Source image changed');
            }}
            onClose={onClose}
        />,
    );
    await act(async () => jobs[0].resolve(result()));
    await waitFor(() =>
        expect(
            screen.getByRole('button', {
                name: 'Replace with flattened image',
            }),
        ).toBeEnabled(),
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Replace with flattened image' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Source image changed');
    expect(onClose).not.toHaveBeenCalled();
});
