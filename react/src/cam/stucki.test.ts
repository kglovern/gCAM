import { createLaserToolpath } from './laser.js';

// Full-image reference, independent of the planner's rolling row buffers.
test.each([false, true])(
    'Stucki matches full-grid diffusion, bidirectional=%s',
    (bidirectional) => {
        const width = 13,
            height = 9;
        const values = Array.from(
            { length: width * height },
            (_, i) => ((i * 47 + 19) % 256) / 255,
        );
        const alpha = values.map((_, i) => (i % 11 ? 255 : 0));
        const data = values.flatMap((v, i) => [
            v * 255,
            v * 255,
            v * 255,
            alpha[i],
        ]);
        const grid = Array.from({ length: height }, (_, row) =>
            Array.from({ length: width }, (_, col) => {
                const i = (height - row - 1) * width + col;
                return alpha[i] ? 1 - values[i] : 0;
            }),
        );
        const visible = (x: number, y: number) =>
            alpha[(height - y - 1) * width + x] > 0;
        const weights = [
            [0, 0, 0, 8, 4],
            [2, 4, 8, 4, 2],
            [1, 2, 4, 2, 1],
        ];
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                if (!visible(x, y)) continue;
                const old = grid[y][x];
                grid[y][x] = old >= 0.5 ? 1 : 0;
                for (let dy = 0; dy < 3; dy++)
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx,
                            ny = y + dy,
                            weight = weights[dy][dx + 2];
                        if (
                            weight &&
                            nx >= 0 &&
                            nx < width &&
                            ny < height &&
                            visible(nx, ny)
                        )
                            grid[ny][nx] += ((old - grid[y][x]) * weight) / 42;
                    }
            }
        const path = createLaserToolpath(
            [],
            {
                operation: 'laser-raster',
                laserFeed: 1000,
                laserPower: 1000,
                laserSMin: 0,
                laserSMax: 1000,
                laserGamma: 1,
                laserSpot: 1,
                laserOverscan: 0,
                laserOptions: {
                    imageMode: 'stucki',
                    trimBlank: false,
                    bidirectional,
                },
            },
            {
                sourceEntities: [
                    {
                        type: 'BITMAP',
                        bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
                        _imageData: { width, height, data },
                    },
                ],
            },
        );
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const row = path.laserPaths.find(
                    (p) => Math.abs(p.points[0].y - (y + 0.5)) < 1e-8,
                );
                if (!row) throw new Error('Missing raster row');
                let power = 0;
                for (let i = 1; i < row.points.length; i++) {
                    const a = row.points[i - 1],
                        b = row.points[i];
                    if (
                        x + 0.5 > Math.min(a.x, b.x) &&
                        x + 0.5 < Math.max(a.x, b.x)
                    )
                        power = b.power;
                }
                expect(power).toBe(grid[y][x] * 1000);
            }
    },
);
