import type { StoredSurfaceMesh } from '../engine/surface-model';

export interface BitmapHeightmapRequest {
    image: { width: number; height: number; data: Uint8ClampedArray };
    widthMm: number;
    heightMm: number;
    reliefMm: number;
    spacingMm: number;
    invert: boolean;
    fileName: string;
}

/** Convert image brightness into the existing editable surface-mesh format. */
export function bitmapHeightmap(
    request: BitmapHeightmapRequest,
): StoredSurfaceMesh {
    const { image, widthMm, heightMm, reliefMm, spacingMm, invert, fileName } =
        request;
    if (
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width * image.height > 16_000_000 ||
        image.data.length !== image.width * image.height * 4
    )
        throw new Error(
            'Heightmap images must contain at most 16 million pixels.',
        );
    if (
        ![widthMm, heightMm, reliefMm, spacingMm].every(
            (value) => Number.isFinite(value) && value > 0 && value <= 100000,
        ) ||
        typeof invert !== 'boolean'
    )
        throw new Error(
            'Heightmap dimensions, relief height and image detail must be positive.',
        );
    const columns = Math.min(
        Math.max(1, image.width - 1),
        Math.ceil(widthMm / spacingMm),
    );
    const rows = Math.min(
        Math.max(1, image.height - 1),
        Math.ceil(heightMm / spacingMm),
    );
    if (columns > 256 || rows > 256)
        throw new Error(
            'Image detail is too fine for this size. Increase spacing or reduce the image size.',
        );
    // shortcut: opaque maps only; add masked surface topology if transparent reliefs are requested.
    for (let index = 3; index < image.data.length; index += 4)
        if (image.data[index] !== 255)
            throw new Error(
                'Heightmaps need an opaque image. Flatten transparency before importing.',
            );
    const brightness = (x: number, y: number) => {
        const offset = (y * image.width + x) * 4;
        return (
            (0.299 * image.data[offset] +
                0.587 * image.data[offset + 1] +
                0.114 * image.data[offset + 2]) /
            255
        );
    };
    const heights = new Float64Array((columns + 1) * (rows + 1));
    let minZ = Infinity,
        maxZ = -Infinity;
    for (let row = 0; row <= rows; row++) {
        const y = (1 - row / rows) * (image.height - 1);
        const y0 = Math.floor(y),
            y1 = Math.min(image.height - 1, y0 + 1),
            ty = y - y0;
        for (let column = 0; column <= columns; column++) {
            const x = (column / columns) * (image.width - 1);
            const x0 = Math.floor(x),
                x1 = Math.min(image.width - 1, x0 + 1),
                tx = x - x0;
            const low = brightness(x0, y0) * (1 - tx) + brightness(x1, y0) * tx;
            const high =
                brightness(x0, y1) * (1 - tx) + brightness(x1, y1) * tx;
            const shade = Math.max(0, Math.min(1, low * (1 - ty) + high * ty));
            const z = (invert ? 1 - shade : shade) * reliefMm;
            heights[row * (columns + 1) + column] = z;
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
    }
    if (maxZ - minZ < 1e-6)
        throw new Error(
            'This heightmap has no brightness variation at the chosen image detail.',
        );
    const vertices: number[] = [];
    const append = (column: number, row: number) =>
        vertices.push(
            (column / columns) * widthMm,
            (row / rows) * heightMm,
            heights[row * (columns + 1) + column],
        );
    for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
            append(column, row);
            append(column + 1, row);
            append(column + 1, row + 1);
            append(column, row);
            append(column + 1, row + 1);
            append(column, row + 1);
        }
    return {
        vertices,
        bounds: { minX: 0, minY: 0, maxX: widthMm, maxY: heightMm, minZ, maxZ },
        sourceName: fileName,
        sourceUnitScaleMm: 1,
        machineUp: [0, 0, 1],
    };
}
