const luminance = (data, i, method) => {
    const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
    switch (method) {
        case 'average':
            return (r + g + b) / (3 * 255);
        case 'red':
            return r / 255;
        case 'green':
            return g / 255;
        case 'blue':
            return b / 255;
        case 'minimum':
            return Math.min(r, g, b) / 255;
        case 'maximum':
            return Math.max(r, g, b) / 255;
        default:
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
};

// Filter source pixels without modifying the asset or allocating a second image.
export function imageLightness(
    image,
    x,
    y,
    smoothing,
    sharpening,
    method = 'luminance',
    edgeGain = 0,
    denoise = 0,
    blurredOverride,
) {
    const { data, width, height } = image;
    const original = luminance(data, (y * width + x) * 4, method);
    if (!smoothing && !sharpening && !edgeGain) return original;
    let total = 0,
        weights = 0;
    for (let dy = -1; blurredOverride === undefined && dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const px = Math.max(0, Math.min(width - 1, x + dx)),
                py = Math.max(0, Math.min(height - 1, y + dy)),
                i = (py * width + px) * 4,
                weight =
                    (dx === 0 ? 2 : 1) *
                    (dy === 0 ? 2 : 1) *
                    (edgeGain ? 255 : data[i + 3]);
            const alpha = data[i + 3] / 255;
            const sample = luminance(data, i, method);
            total += (edgeGain ? sample * alpha + 1 - alpha : sample) * weight;
            weights += weight;
        }
    const blurred = blurredOverride ?? (weights ? total / weights : original);
    const smoothed = original + smoothing * (blurred - original);
    const detail = original - blurred;
    const enhanced = denoise
        ? Math.sign(detail) * Math.max(0, Math.abs(detail) - denoise)
        : detail;
    const filtered = Math.max(0, Math.min(1, smoothed + sharpening * enhanced));
    return edgeGain
        ? 1 - Math.min(1, Math.abs(filtered - blurred) * 4 * edgeGain)
        : filtered;
}

// Cache one source-row band (about 2 MiB), rather than a full filtered image.
export function createImageLightnessSampler(image, options) {
    const {
        smoothing,
        sharpening,
        grayscale,
        filterRadius,
        sharpeningDenoise,
    } = options;
    const edge = options.imageMode === 'edge' ? options.edgeGain : 0;
    const sample = (x, y, blurred) =>
        imageLightness(
            image,
            x,
            y,
            smoothing,
            sharpening,
            grayscale,
            edge,
            sharpeningDenoise,
            blurred,
        );
    if (filterRadius === 1 || (!smoothing && !sharpening && !edge))
        return (x, y) => sample(x, y);
    const radius = filterRadius;
    const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) =>
        Math.exp(-0.5 * ((i - radius) / (radius / 2)) ** 2),
    );
    const tileHeight = Math.max(
        1,
        Math.min(64, Math.floor(262144 / image.width)),
    );
    const capacity = Math.min(4096, Math.ceil(image.width / 64));
    const tiles = new Map();
    return (x, y) => {
        const left = Math.floor(x / 64) * 64,
            top = Math.floor(y / tileHeight) * tileHeight;
        const key = `${left}:${top}`;
        let tile = tiles.get(key);
        if (!tile) {
            const width = Math.min(64, image.width - left);
            const height = Math.min(tileHeight, image.height - top);
            const rows = height + 2 * radius;
            const values = new Float64Array(width * rows);
            const weights = new Float64Array(width * rows);
            for (let row = 0; row < rows; row++) {
                const py = Math.max(
                    0,
                    Math.min(image.height - 1, top + row - radius),
                );
                for (let col = 0; col < width; col++) {
                    const slot = row * width + col;
                    for (let dx = -radius; dx <= radius; dx++) {
                        const px = Math.max(
                            0,
                            Math.min(image.width - 1, left + col + dx),
                        );
                        const i = (py * image.width + px) * 4;
                        const alpha = image.data[i + 3] / 255;
                        const weight = kernel[dx + radius] * (edge ? 1 : alpha);
                        const light = luminance(image.data, i, grayscale);
                        values[slot] +=
                            (edge ? light * alpha + 1 - alpha : light) * weight;
                        weights[slot] += weight;
                    }
                }
            }
            tile = { width, data: new Float64Array(width * height) };
            for (let row = 0; row < height; row++)
                for (let col = 0; col < width; col++) {
                    let total = 0,
                        weight = 0;
                    for (let dy = 0; dy < kernel.length; dy++) {
                        const slot = (row + dy) * width + col;
                        total += values[slot] * kernel[dy];
                        weight += weights[slot] * kernel[dy];
                    }
                    tile.data[row * width + col] = weight
                        ? total / weight
                        : luminance(
                              image.data,
                              ((top + row) * image.width + left + col) * 4,
                              grayscale,
                          );
                }
            if (tiles.size === capacity)
                tiles.delete(tiles.keys().next().value);
        } else tiles.delete(key);
        tiles.set(key, tile);
        return sample(x, y, tile.data[(y - top) * tile.width + x - left]);
    };
}
