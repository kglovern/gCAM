import { jest } from '@jest/globals';
import { saveBinaryFile } from './saveTextFile';

type Runtime = Window & {
    cordova?: unknown;
    gcamFiles?: { saveBinary?: (...args: any[]) => void };
};
const runtime = window as Runtime;
afterEach(() => {
    delete runtime.cordova;
    delete runtime.gcamFiles;
    jest.restoreAllMocks();
});

test('native exports preserve PNG signature and arbitrary bytes', async () => {
    runtime.cordova = {};
    const saveBinary = jest.fn((_name, _base64, _mime, success: () => void) =>
        success(),
    );
    runtime.gcamFiles = { saveBinary };
    const bytes = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128,
    ]);
    await saveBinaryFile(
        new Blob([bytes], { type: 'image/png' }),
        'part/test.png',
    );
    expect(saveBinary.mock.calls[0].slice(0, 3)).toEqual([
        'part-test.png',
        btoa(String.fromCharCode(...bytes)),
        'image/png',
    ]);
});

test('cancellation resolves and write errors propagate', async () => {
    runtime.cordova = {};
    runtime.gcamFiles = {
        saveBinary: (_n, _b, _m, _ok, fail) => fail('CANCELLED'),
    };
    await expect(
        saveBinaryFile(new Blob(['abc']), 'x'),
    ).resolves.toBeUndefined();
    runtime.gcamFiles.saveBinary = (_n, _b, _m, _ok, fail) => fail('No space');
    await expect(saveBinaryFile(new Blob(['abc']), 'x')).rejects.toThrow(
        'No space',
    );
});

test('old native plugin cannot silently fall back to text', async () => {
    runtime.cordova = {};
    runtime.gcamFiles = {};
    await expect(saveBinaryFile(new Blob(['abc']), 'x')).rejects.toThrow(
        'not ready',
    );
});

test('browser downloads original blob and revokes its URL', async () => {
    jest.useFakeTimers();
    const blob = new Blob([new Uint8Array([0, 128, 255])]);
    const create = jest.fn(() => 'blob:binary');
    const revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: create,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: revoke,
    });
    const click = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.download).toBe('x-y.png');
            expect(this.href).toBe('blob:binary');
        });
    try {
        await saveBinaryFile(blob, 'x/y.png');
        expect(create).toHaveBeenCalledWith(blob);
        expect(click).toHaveBeenCalledTimes(1);
        jest.runAllTimers();
        expect(revoke).toHaveBeenCalledWith('blob:binary');
    } finally {
        jest.useRealTimers();
    }
});
