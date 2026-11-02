import { jest } from '@jest/globals';
import { readJpegPhysicalSize } from './jpegMetadata';
import {
    exifSegment,
    jfifSegment,
    jpegSegment,
    metadataJpeg,
} from './fixtures/jpegMetadata.js';
const read = (bytes: Uint8Array, w = 400, h = 100) =>
    readJpegPhysicalSize(new Blob([Uint8Array.from(bytes)]), w, h);
test('JFIF inch/cm density and independent X/Y axes produce physical dimensions', async () => {
    expect(await read(metadataJpeg([jfifSegment()]))).toEqual({
        wMm: 40,
        hMm: 20,
    });
    expect(await read(metadataJpeg([jfifSegment(2, 100, 50)]))).toEqual({
        wMm: 40,
        hMm: 20,
    });
    for (const segment of [
        jfifSegment(0),
        jfifSegment(3),
        jfifSegment(1, 0, 100),
    ])
        expect(await read(metadataJpeg([segment]))).toBeUndefined();
});
test.each([true, false])(
    'EXIF TIFF endianness %s, density priority and orientation agreement',
    async (little) => {
        for (let orientation = 1; orientation <= 8; orientation++) {
            const data = metadataJpeg([
                jfifSegment(1, 72, 72),
                exifSegment({ orientation, little }),
            ]);
            expect(
                await read(
                    data,
                    orientation >= 5 ? 100 : 400,
                    orientation >= 5 ? 400 : 100,
                ),
            ).toEqual(
                orientation >= 5 ? { wMm: 20, hMm: 40 } : { wMm: 40, hMm: 20 },
            );
        }
        expect(
            await read(
                metadataJpeg([exifSegment({ little, unit: 3, x: 100, y: 50 })]),
            ),
        ).toEqual({ wMm: 40, hMm: 20 });
        expect(
            await read(metadataJpeg([exifSegment({ little, orientation: 6 })])),
        ).toBeUndefined();
    },
);
test('unitless EXIF uses JFIF absolute density while retaining rotated axes', async () => {
    expect(
        await read(
            metadataJpeg([
                jfifSegment(),
                exifSegment({ unit: 1, orientation: 6 }),
            ]),
            100,
            400,
        ),
    ).toEqual({ wMm: 20, hMm: 40 });
    expect(
        await read(metadataJpeg([exifSegment({ unit: 1 })])),
    ).toBeUndefined();
});
test('malformed TIFF pointers, counts, rational values, duplicate tags and orientations fall back safely', async () => {
    for (const kind of [
        'offset',
        'count',
        'zero',
        'pointer',
        'type',
        'duplicate',
        'orientation',
        'signature',
    ]) {
        const segment = exifSegment(),
            view = new DataView(segment.buffer),
            tiff = 10;
        if (kind === 'offset') view.setUint32(tiff + 4, 0xffffffff, true);
        if (kind === 'count') view.setUint16(tiff + 8, 65535, true);
        if (kind === 'zero') view.setUint32(tiff + 66, 0, true);
        if (kind === 'pointer') view.setUint32(tiff + 30, 0xfffffff0, true);
        if (kind === 'type') view.setUint16(tiff + 24, 3, true);
        if (kind === 'duplicate') view.setUint16(tiff + 46, 0x112, true);
        if (kind === 'orientation') view.setUint16(tiff + 18, 9, true);
        if (kind === 'signature') segment[tiff] = 0;
        expect(
            await read(metadataJpeg([jfifSegment(), segment])),
        ).toBeUndefined();
    }
});
test('rejects duplicate metadata, truncated JPEG headers, mismatch and unsupported data', async () => {
    for (const segments of [
        [jfifSegment(), jfifSegment()],
        [exifSegment(), exifSegment()],
    ])
        expect(await read(metadataJpeg(segments))).toBeUndefined();
    const bytes = metadataJpeg([jfifSegment()]);
    for (const end of [0, 1, 4, 10, bytes.length - 6])
        expect(await read(bytes.slice(0, end))).toBeUndefined();
    expect(await read(bytes, 401, 100)).toBeUndefined();
    expect(await read(bytes, 0, 100)).toBeUndefined();
    expect(await read(Uint8Array.from([1, 2, 3]))).toBeUndefined();
});
test('skips large ancillary segments and bounds metadata-chain reads', async () => {
    const slices = jest.spyOn(Blob.prototype, 'slice');
    try {
        const data = metadataJpeg([
            jpegSegment(0xe2, new Uint8Array(60000)),
            jfifSegment(),
        ]);
        expect(await read(data)).toEqual({ wMm: 40, hMm: 20 });
        expect(
            slices.mock.calls.every(
                ([start = 0, end = 0]) => end - start <= 14,
            ),
        ).toBe(true);
        const crowded = metadataJpeg(
            Array.from({ length: 260 }, () => jpegSegment(0xe2, [])),
        );
        expect(await read(crowded)).toBeUndefined();
    } finally {
        slices.mockRestore();
    }
});
