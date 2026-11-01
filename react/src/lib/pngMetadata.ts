export const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function pngCrc(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

const uint32 = (bytes: Uint8Array, offset: number) =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        offset,
    );

/** Read metadata slices only: large text/profile chunks and compressed pixels are skipped. */
export async function readPngPhysicalSize(
    file: Blob,
    pixelW: number,
    pixelH: number,
): Promise<{ wMm: number; hMm: number } | undefined> {
    if (
        !Number.isSafeInteger(pixelW) ||
        !Number.isSafeInteger(pixelH) ||
        pixelW < 1 ||
        pixelH < 1
    )
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
    const signature = await read(0, 8);
    if (
        signature.length !== 8 ||
        PNG_SIGNATURE.some((v, i) => signature[i] !== v)
    )
        return;
    let offset = 8,
        header = false;
    let size: { wMm: number; hMm: number } | undefined;
    // Bound asynchronous reads on malformed/hostile metadata chains.
    for (let chunks = 0; chunks < 256 && offset + 12 <= file.size; chunks++) {
        const chunk = await read(offset, 8);
        if (chunk.length !== 8) return;
        const length = uint32(chunk, 0),
            end = offset + length + 12;
        if (length > 0x7fffffff || end > file.size) return;
        const type = String.fromCharCode(...chunk.subarray(4, 8));
        if (!header && (type !== 'IHDR' || length !== 13)) return;
        if (type === 'IDAT') return size;
        if (type === 'IEND') return;
        if (type === 'IHDR' || type === 'pHYs') {
            if (
                (type === 'IHDR' && header) ||
                (type === 'pHYs' && (size || length !== 9))
            )
                return;
            const body = await read(offset + 4, length + 8);
            if (
                body.length !== length + 8 ||
                pngCrc(body.subarray(0, -4)) !== uint32(body, body.length - 4)
            )
                return;
            if (type === 'IHDR') {
                if (uint32(body, 4) !== pixelW || uint32(body, 8) !== pixelH)
                    return;
                header = true;
            } else {
                const x = uint32(body, 4),
                    y = uint32(body, 8);
                if (body[12] !== 1 || !x || !y) return;
                size = { wMm: (pixelW * 1000) / x, hMm: (pixelH * 1000) / y };
            }
        }
        offset = end;
    }
}
