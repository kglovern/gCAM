import type { DepthPreviewImage } from '../lib/cut-depth-preview';
import type { CanvasCamera } from './camera';
const images = new WeakMap<
    DepthPreviewImage,
    [OffscreenCanvas, OffscreenCanvas]
>();
export function drawCutDepthImage(
    ctx: CanvasRenderingContext2D,
    image: DepthPreviewImage,
    camera: CanvasCamera,
    dark: boolean,
) {
    let cached = images.get(image);
    if (!cached) {
        cached = [
            new OffscreenCanvas(image.width, image.height),
            new OffscreenCanvas(image.width, image.height),
        ];
        cached.forEach((canvas, i) => {
            canvas
                .getContext('2d')!
                .putImageData(
                    new ImageData(
                        new Uint8ClampedArray(i ? image.dark : image.light),
                        image.width,
                        image.height,
                    ),
                    0,
                    0,
                );
        });
        images.set(image, cached);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        cached[dark ? 1 : 0],
        camera.tx + image.minX * camera.scale,
        camera.ty - image.maxY * camera.scale,
        (image.maxX - image.minX) * camera.scale,
        (image.maxY - image.minY) * camera.scale,
    );
    ctx.restore();
}
