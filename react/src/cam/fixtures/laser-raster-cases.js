const rectangle = (left, bottom, right, top) =>
    [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
        [left, bottom],
    ].map(([x, y]) => ({ x, y }));
export const rasterCases = [
    'grayscale',
    'threshold',
    'ordered',
    'floyd-steinberg',
    'atkinson',
    'jarvis',
]
    .flatMap((mode) =>
        [0, 17, 45, 90, 135].flatMap((angle) =>
            [0, 1].map((variant) => ({
                name: `${mode}-${angle}-${variant}`,
                mode,
                angle,
                variant,
                threshold: variant ? 0.35 : 0.5,
            })),
        ),
    )
    .concat(
        ['floyd-steinberg', 'atkinson', 'jarvis'].flatMap((mode) =>
            [0, 45].flatMap((angle) =>
                [0, 1].map((threshold) => ({
                    name: `${mode}-${angle}-threshold-${threshold}`,
                    mode,
                    angle,
                    variant: 1,
                    threshold,
                })),
            ),
        ),
    );
export function rasterRequest(fixture) {
    const data = new Uint8ClampedArray(16 * 12 * 4);
    for (let y = 0; y < 12; y++)
        for (let x = 0; x < 16; x++) {
            const i = (y * 16 + x) * 4;
            data[i] = (37 * x + 61 * y) % 256;
            data[i + 1] = (19 * x + 43 * y) % 256;
            data[i + 2] = (83 * x + 17 * y) % 256;
            data[i + 3] =
                (x + y) % 7 === 0 ? 0 : (2 * x + y) % 5 === 0 ? 96 : 255;
        }
    return {
        config: {
            operation: 'laser-raster',
            laserFeed: 2000,
            laserPower: 750,
            laserSMin: 20,
            laserSMax: 800,
            laserGamma: 1.3,
            laserSpot: 0.5,
            laserOverscan: 1.3,
            laserOptions: {
                imageMode: fixture.mode,
                scanAngle: fixture.angle,
                threshold: fixture.threshold,
                brightness: 0.07,
                contrast: 1.2,
                invert: !!fixture.variant,
                trimBlank: !fixture.variant,
                bidirectional: !fixture.variant,
                imageCrop: fixture.variant
                    ? { left: 0.1, bottom: 0.15, right: 0.9, top: 0.85 }
                    : { left: 0, bottom: 0, right: 1, top: 1 },
                imageMask: fixture.variant
                    ? [rectangle(0, 0, 1, 1), rectangle(0.35, 0.35, 0.65, 0.65)]
                    : [],
            },
        },
        options: {
            sourceEntities: [
                {
                    type: 'BITMAP',
                    rotation: fixture.variant ? -27 : 33,
                    bounds: { minX: 10, minY: 20, maxX: 25, maxY: 31 },
                    _imageData: { width: 16, height: 12, data },
                },
            ],
        },
    };
}
// Normalize both preview representations to the pre-change powered-segment reference.
export function rasterSegments(contours) {
    return contours.flatMap((line) => {
        if (!line._laserVariablePower) return [line];
        return line.slice(1).flatMap((p, i) => {
            if (p.power <= 0) return [];
            return [
                Object.assign([line[i], p], { _laserPower: p.power / 1000 }),
            ];
        });
    });
}
export function rasterSignature(path) {
    const n = (v) => Number(v.toFixed(8));
    return JSON.stringify({
        paths: path.laserPaths.map((p) =>
            p.points.map((v) => [n(v.x), n(v.y), v.power]),
        ),
        preview: rasterSegments(path.previewContours).map((p) => ({
            points: p.map((v) => [n(v.x), n(v.y)]),
            power: p._laserPower,
        })),
    });
}
