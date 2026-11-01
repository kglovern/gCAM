import { readPngPhysicalSize, pngCrc } from './pngMetadata';
import { pngPhysicalSize } from '../platform/processedImagePng';

const source = Uint8Array.from(
    atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
);
const sized = () => pngPhysicalSize(source, 1, 2);
function repair(bytes: Uint8Array, offset: number) {
    const view = new DataView(bytes.buffer);
    const length = view.getUint32(offset);
    view.setUint32(
        offset + 8 + length,
        pngCrc(bytes.subarray(offset + 4, offset + 8 + length)),
    );
}

test('PNG physical size round trips independent X/Y density through Blob slices', async () => {
    expect(await readPngPhysicalSize(new Blob([sized()]), 1, 1)).toEqual({
        wMm: 1,
        hMm: 2,
    });
    expect(await readPngPhysicalSize(new Blob([source]), 1, 1)).toBeUndefined();
    expect(
        await readPngPhysicalSize(new Blob(['not png']), 1, 1),
    ).toBeUndefined();
});

test('invalid density CRC, unit, zero values, duplicate chunks and mismatched headers are ignored', async () => {
    const broken = sized();
    broken[41] ^= 1;
    expect(await readPngPhysicalSize(new Blob([broken]), 1, 1)).toBeUndefined();
    for (const field of ['unit', 'zero', 'header']) {
        const bytes = sized();
        if (field === 'unit') bytes[49] = 0;
        if (field === 'zero') new DataView(bytes.buffer).setUint32(41, 0);
        if (field === 'header') bytes[16] = 3;
        repair(bytes, field === 'header' ? 8 : 33);
        expect(
            await readPngPhysicalSize(new Blob([bytes]), 1, 1),
        ).toBeUndefined();
    }
    const bytes = sized();
    expect(
        await readPngPhysicalSize(
            new Blob([
                bytes.subarray(0, 54),
                bytes.subarray(33, 54),
                bytes.subarray(54),
            ]),
            1,
            1,
        ),
    ).toBeUndefined();
    expect(await readPngPhysicalSize(new Blob([bytes]), 2, 1)).toBeUndefined();
});

test('oversized chunk lengths, truncated headers and truncated density data are ignored', async () => {
    const huge = sized();
    new DataView(huge.buffer).setUint32(33, 0xffffffff);
    expect(await readPngPhysicalSize(new Blob([huge]), 1, 1)).toBeUndefined();
    for (const length of [7, 20, 40, 50])
        expect(
            await readPngPhysicalSize(
                new Blob([sized().slice(0, length)]),
                1,
                1,
            ),
        ).toBeUndefined();
});

test('large ancillary payloads are skipped instead of copied while reading density', async () => {
    const bytes = sized();
    const ancillary = new Uint8Array(1024 * 1024);
    const view = new DataView(ancillary.buffer);
    view.setUint32(0, ancillary.length - 12);
    ancillary.set([116, 69, 88, 116], 4);
    const file = new Blob([
        bytes.subarray(0, 33),
        ancillary,
        bytes.subarray(33),
    ]);
    const slices: number[] = [];
    const original = file.slice.bind(file);
    file.slice = (start = 0, end = file.size, type) => {
        slices.push(end - start);
        return original(start, end, type);
    };
    expect(await readPngPhysicalSize(file, 1, 1)).toEqual({ wMm: 1, hMm: 2 });
    expect(Math.max(...slices)).toBeLessThanOrEqual(21);
});
