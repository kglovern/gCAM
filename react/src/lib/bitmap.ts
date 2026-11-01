import { readJpegPhysicalSize } from './jpegMetadata';
import { readPngPhysicalSize } from './pngMetadata';
/**
 * Purpose: Implementation module for bitmap in the lib domain.
 */
export interface BitmapPlacement {
    x: number;
    y: number;
    wMm: number;
    hMm: number;
}

/**
 * Bitmap placement mirroring legacy gCAM: max 80mm wide (120mm tall cap),
 * aspect preserved, centered on the given view center.
 */
export function placeBitmap(
    pixelW: number,
    pixelH: number,
    centerX = 50,
    centerY = 50,
    stockBounds?: { minX: number; minY: number; maxX: number; maxY: number },
    physicalSize?: { wMm: number; hMm: number },
): BitmapPlacement {
    const safeW = Math.max(1, pixelW);
    const safeH = Math.max(1, pixelH);
    let wMm = 80;
    let hMm = (wMm * safeH) / safeW;
    if (hMm > 120) {
        hMm = 120;
        wMm = (hMm * safeW) / safeH;
    }
    if (physicalSize) {
        if (
            ![physicalSize.wMm, physicalSize.hMm].every(
                (v) => Number.isFinite(v) && v > 0,
            )
        )
            throw new Error('Invalid image physical size.');
        wMm = physicalSize.wMm;
        hMm = physicalSize.hMm;
    }
    let x = centerX - wMm / 2,
        y = centerY - hMm / 2;
    if (stockBounds) {
        const scale = physicalSize
            ? 1
            : Math.min(
                  1,
                  (stockBounds.maxX - stockBounds.minX) / wMm,
                  (stockBounds.maxY - stockBounds.minY) / hMm,
              );
        wMm *= scale;
        hMm *= scale;
        x = Math.max(
            stockBounds.minX,
            Math.min(centerX - wMm / 2, stockBounds.maxX - wMm),
        );
        y = Math.max(
            stockBounds.minY,
            Math.min(centerY - hMm / 2, stockBounds.maxY - hMm),
        );
    }
    return {
        x,
        y,
        wMm,
        hMm,
    };
}

const BITMAP_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function isBitmapFile(file: File): boolean {
    // Browsers also report SVG and DXF drawings as image MIME types.
    if (
        file.type.toLowerCase() === 'image/svg+xml' ||
        /^image\/(?:vnd\.|x-)?dxf$/i.test(file.type) ||
        /\.(svg|dxf)$/i.test(file.name)
    )
        return false;
    return file.type.startsWith('image/') || BITMAP_RE.test(file.name);
}

/** Extract raw pixels for raster sampling (browser canvas required). */
export function imageDataOf(img: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Decode an image file to a data URL plus its pixel dimensions. */
export function loadBitmapFile(
    file: File,
    usePhysicalSize = false,
): Promise<{
    dataUrl: string;
    pixelW: number;
    pixelH: number;
    physicalSize?: { wMm: number; hMm: number };
}> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            const img = new Image();
            img.onload = async () => {
                const physicalSize = usePhysicalSize
                    ? await (async () =>
                          (await readPngPhysicalSize(
                              file,
                              img.naturalWidth,
                              img.naturalHeight,
                          )) ??
                          (await readJpegPhysicalSize(
                              file,
                              img.naturalWidth,
                              img.naturalHeight,
                          )))().catch(() => undefined)
                    : undefined;
                resolve({
                    dataUrl,
                    pixelW: img.naturalWidth,
                    pixelH: img.naturalHeight,
                    ...(physicalSize ? { physicalSize } : {}),
                });
            };
            img.onerror = () => reject(new Error('Could not decode image.'));
            img.src = dataUrl;
        };
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}
