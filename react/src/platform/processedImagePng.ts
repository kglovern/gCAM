import type { ProcessedLaserImage } from '../engine/cam-worker-protocol';

import { PNG_SIGNATURE as signature, pngCrc } from '../lib/pngMetadata';
const typeAt = (bytes: Uint8Array, offset: number) =>
    String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));

/** Replace the browser encoder's default 96 DPI with the actual cropped size. */
export function pngPhysicalSize(
    bytes: Uint8Array,
    widthMm: number,
    heightMm: number,
): Uint8Array<ArrayBuffer> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
        bytes.length < 33 ||
        signature.some((v, i) => bytes[i] !== v) ||
        typeAt(bytes, 8) !== 'IHDR' ||
        view.getUint32(8) !== 13
    )
        throw new Error('Invalid PNG export.');
    const pixels = [view.getUint32(16), view.getUint32(20)];
    const ppm = [widthMm, heightMm].map((mm, i) => {
        const value = Math.round((pixels[i] * 1000) / mm);
        if (
            !Number.isFinite(mm) ||
            mm <= 0 ||
            !Number.isSafeInteger(value) ||
            value < 1 ||
            value > 0xffffffff
        )
            throw new Error('Invalid PNG physical size.');
        return value;
    });
    const physical = new Uint8Array(21);
    const pv = new DataView(physical.buffer);
    pv.setUint32(0, 9);
    physical.set([112, 72, 89, 115], 4); // pHYs
    pv.setUint32(8, ppm[0]);
    pv.setUint32(12, ppm[1]);
    physical[16] = 1; // pixels per metre
    pv.setUint32(17, pngCrc(physical.subarray(4, 17)));
    const chunks: Uint8Array[] = [bytes.subarray(0, 33), physical];
    let offset = 33,
        ended = false;
    while (offset < bytes.length) {
        if (offset + 12 > bytes.length)
            throw new Error('Truncated PNG export.');
        const end = offset + 12 + view.getUint32(offset);
        if (end > bytes.length) throw new Error('Truncated PNG export.');
        const type = typeAt(bytes, offset);
        if (type !== 'pHYs') chunks.push(bytes.subarray(offset, end));
        offset = end;
        if (type === 'IEND') {
            ended = true;
            break;
        }
    }
    if (!ended || offset !== bytes.length)
        throw new Error('Invalid PNG export.');
    const result = new Uint8Array(
        chunks.reduce((n, chunk) => n + chunk.length, 0),
    );
    offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export async function processedImagePng(
    image: ProcessedLaserImage,
): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image export is unavailable.');
        const pixels = ctx.createImageData(image.width, image.height);
        pixels.data.set(image.data);
        ctx.putImageData(pixels, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (value) =>
                    value
                        ? resolve(value)
                        : reject(new Error('Could not encode image.')),
                'image/png',
            ),
        );
        const png = pngPhysicalSize(
            new Uint8Array(await blob.arrayBuffer()),
            image.widthMm,
            image.heightMm,
        );
        return new Blob([png], { type: 'image/png' });
    } finally {
        canvas.width = canvas.height = 0;
    }
}
