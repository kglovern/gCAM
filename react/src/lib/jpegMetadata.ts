type Density = { x: number; y: number; mm: number };
type Exif = { orientation: number; density?: Density };
const u16 = (bytes: Uint8Array, offset: number) =>
    (bytes[offset] << 8) | bytes[offset + 1];
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

function exifMetadata(bytes: Uint8Array): Exif | undefined {
    try {
        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        );
        const order = text(bytes.subarray(0, 2));
        if (!['II', 'MM'].includes(order)) return;
        const little = order === 'II';
        const short = (at: number) => view.getUint16(at, little);
        const long = (at: number) => view.getUint32(at, little);
        if (short(2) !== 42) return;
        const ifd = long(4);
        if (ifd < 8) return;
        const count = short(ifd);
        if (count > 256 || ifd + 2 + count * 12 + 4 > bytes.length) return;
        const values = new Map<number, number>();
        for (let i = 0; i < count; i++) {
            const at = ifd + 2 + i * 12,
                tag = short(at);
            if (![0x112, 0x11a, 0x11b, 0x128].includes(tag)) continue;
            if (values.has(tag) || long(at + 4) !== 1) return;
            const type = short(at + 2);
            if (tag === 0x11a || tag === 0x11b) {
                if (type !== 5) return;
                const pointer = long(at + 8);
                if (pointer < 8 || pointer + 8 > bytes.length) return;
                const denominator = long(pointer + 4);
                if (!denominator || !long(pointer)) return;
                values.set(tag, long(pointer) / denominator);
            } else {
                if (type !== 3) return;
                values.set(tag, short(at + 8));
            }
        }
        const orientation = values.get(0x112) ?? 1;
        if (orientation < 1 || orientation > 8) return;
        const unit = values.get(0x128),
            x = values.get(0x11a),
            y = values.get(0x11b);
        return {
            orientation,
            ...(x && y && (unit === 2 || unit === 3)
                ? { density: { x, y, mm: unit === 2 ? 25.4 : 10 } }
                : {}),
        };
    } catch {
        return;
    }
}

/** Read bounded JPEG headers only; the browser owns EXIF pixel rotation/reflection. */
export async function readJpegPhysicalSize(
    file: Blob,
    pixelW: number,
    pixelH: number,
): Promise<{ wMm: number; hMm: number } | undefined> {
    if (![pixelW, pixelH].every((v) => Number.isSafeInteger(v) && v > 0))
        return;
    const read = (offset: number, length: number) =>
        new Promise<Uint8Array>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () =>
                reject(new Error('Could not read image metadata.'));
            reader.onload = () =>
                resolve(new Uint8Array(reader.result as ArrayBuffer));
            reader.readAsArrayBuffer(file.slice(offset, offset + length));
        });
    const signature = await read(0, 2);
    if (signature[0] !== 255 || signature[1] !== 216) return;
    let offset = 2,
        jfif: Density | undefined,
        exif: Exif | undefined,
        width = 0,
        height = 0,
        sawJfif = false;
    for (let markers = 0; markers < 256 && offset + 2 <= file.size; markers++) {
        const header = await read(offset, 4);
        if (header[0] !== 255) return;
        const marker = header[1];
        if (marker === 255) {
            offset++;
            continue;
        }
        if (marker === 0xda) {
            if (
                header.length !== 4 ||
                u16(header, 2) < 6 ||
                offset + 2 + u16(header, 2) > file.size
            )
                return;
            const rotated = (exif?.orientation ?? 1) >= 5;
            if (
                !width ||
                !height ||
                pixelW !== (rotated ? height : width) ||
                pixelH !== (rotated ? width : height)
            )
                return;
            const density = exif?.density ?? jfif;
            if (!density) return;
            const wMm = (width * density.mm) / density.x,
                hMm = (height * density.mm) / density.y;
            if (![wMm, hMm].every((v) => Number.isFinite(v) && v > 0)) return;
            return rotated ? { wMm: hMm, hMm: wMm } : { wMm, hMm };
        }
        if (marker === 0xd9 || marker === 0 || marker === 0xd8) return;
        if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        if (header.length !== 4) return;
        const length = u16(header, 2),
            end = offset + length + 2;
        if (length < 2 || end > file.size) return;
        if (marker === 0xe0) {
            const body = await read(offset + 4, Math.min(14, length - 2));
            if (text(body.subarray(0, 5)) === 'JFIF\0') {
                if (
                    sawJfif ||
                    body.length !== 14 ||
                    16 + 3 * body[12] * body[13] > length
                )
                    return;
                sawJfif = true;
                const unit = body[7],
                    x = u16(body, 8),
                    y = u16(body, 10);
                if ((unit === 1 || unit === 2) && x && y)
                    jfif = { x, y, mm: unit === 1 ? 25.4 : 10 };
            }
        } else if (marker === 0xe1) {
            const prefix = await read(offset + 4, Math.min(6, length - 2));
            if (text(prefix) === 'Exif\0\0') {
                if (exif) return;
                const parsed = exifMetadata(
                    await read(offset + 10, length - 8),
                );
                if (!parsed) return;
                exif = parsed;
            }
        } else if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
            const body = await read(offset + 4, Math.min(6, length - 2));
            if (width || body.length !== 6 || length < 8 + 3 * body[5]) return;
            height = u16(body, 1);
            width = u16(body, 3);
        }
        offset = end;
    }
}
