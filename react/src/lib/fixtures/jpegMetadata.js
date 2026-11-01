export const jpegSegment = (marker, body) =>
    Uint8Array.from([
        255,
        marker,
        (body.length + 2) >> 8,
        (body.length + 2) & 255,
        ...body,
    ]);
export function exifSegment({
    orientation = 1,
    x = 254,
    y = 127,
    unit = 2,
    little = true,
} = {}) {
    const bytes = new Uint8Array(78),
        view = new DataView(bytes.buffer);
    const short = (at, v) => view.setUint16(at, v, little),
        long = (at, v) => view.setUint32(at, v, little);
    bytes.set(little ? [73, 73] : [77, 77]);
    short(2, 42);
    long(4, 8);
    short(8, 4);
    [
        [0x112, 3, orientation],
        [0x11a, 5, 62],
        [0x11b, 5, 70],
        [0x128, 3, unit],
    ].forEach(([tag, type, value], i) => {
        const at = 10 + i * 12;
        short(at, tag);
        short(at + 2, type);
        long(at + 4, 1);
        if (type === 3) short(at + 8, value);
        else long(at + 8, value);
    });
    long(62, x);
    long(66, 1);
    long(70, y);
    long(74, 1);
    return jpegSegment(0xe1, [69, 120, 105, 102, 0, 0, ...bytes]);
}
export const jfifSegment = (unit = 1, x = 254, y = 127) =>
    jpegSegment(0xe0, [
        74,
        70,
        73,
        70,
        0,
        1,
        2,
        unit,
        x >> 8,
        x & 255,
        y >> 8,
        y & 255,
        0,
        0,
    ]);
export function metadataJpeg(segments = [], width = 400, height = 100) {
    return Uint8Array.from([
        255,
        216,
        ...segments.flatMap((bytes) => [...bytes]),
        ...jpegSegment(0xc0, [
            8,
            height >> 8,
            height & 255,
            width >> 8,
            width & 255,
            1,
            1,
            17,
            0,
        ]),
        ...jpegSegment(0xda, [1, 1, 0, 0, 63, 0]),
        0,
        255,
        217,
    ]);
}
