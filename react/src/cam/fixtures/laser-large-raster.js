export function largeRasterRequest({
    width = 300,
    height = 200,
    interval = 0.1,
    mode = 'grayscale',
    passes = 1,
    detail = 'solid',
} = {}) {
    const pixels =
        detail === 'stripes'
            ? 3000
            : detail === 'gradient'
              ? 64
              : detail === 'noise'
                ? 512
                : 1;
    const pixelHeight = detail === 'noise' ? 512 : 1;
    const data = new Uint8ClampedArray(pixels * pixelHeight * 4);
    let seed = 17;
    for (let x = 0; x < pixels * pixelHeight; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const value =
            detail === 'gradient'
                ? Math.round((255 * x) / (pixels - 1))
                : detail === 'stripes'
                  ? (x % 2) * 255
                  : detail === 'noise'
                    ? seed >>> 24
                    : 0;
        data[x * 4] = data[x * 4 + 1] = data[x * 4 + 2] = value;
        data[x * 4 + 3] = 255;
    }
    return {
        config: {
            operation: 'laser-raster',
            laserFeed: 3000,
            laserPower: 750,
            laserSMin: 0,
            laserSMax: 750,
            laserGamma: 1,
            laserSpot: interval,
            laserOverscan: 2,
            laserOptions: { imageMode: mode, passes },
            spindle: 12000,
            feedRate: 3000,
            plungeRate: 300,
            safeZ: 5,
            toolDiameter: 1,
        },
        options: {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    bounds: {
                        minX: 10,
                        minY: 20,
                        maxX: 10 + width,
                        maxY: 20 + height,
                    },
                    _imageData: { width: pixels, height: pixelHeight, data },
                },
            ],
        },
    };
}
