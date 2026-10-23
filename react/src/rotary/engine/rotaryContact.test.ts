import type { StlMesh } from './types';
import { createRotaryContact, triangleContact } from './rotaryContact';

test('ball and flat contact include the interior of a sloping face', () => {
    const a = { x: -10, y: -10, z: 0 },
        b = { x: 10, y: -10, z: 20 },
        c = { x: 0, y: 10, z: 10 };
    expect(triangleContact(a, b, c, 0, 2, true)).toBeCloseTo(
        10 + 2 * Math.SQRT2,
        8,
    );
    expect(triangleContact(a, b, c, 0, 2, false)).toBeCloseTo(12, 8);
});

test('vertical faces and vertices are not lost in a projected height field', () => {
    const a = { x: 1, y: -1, z: 0 },
        b = { x: 1, y: 1, z: 0 },
        c = { x: 1, y: 0, z: 4 };
    expect(triangleContact(a, b, c, 0, 2, true)).toBeCloseTo(
        4 + Math.sqrt(3),
        8,
    );
    expect(triangleContact(a, b, c, 0, 2, false)).toBe(4);
    expect(triangleContact(a, b, c, 10, 2, true)).toBe(-Infinity);
});

test('analytic contacts enclose independently sampled triangle surfaces', () => {
    let seed = 1234;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    for (let trial = 0; trial < 25; trial++) {
        const points = Array.from({ length: 3 }, () => ({
            x: random() * 6 - 3,
            y: random() * 6 - 3,
            z: random() * 8 - 4,
        }));
        for (const ball of [true, false]) {
            const actual = triangleContact(
                points[0],
                points[1],
                points[2],
                0,
                2,
                ball,
            );
            let sampled = -Infinity;
            for (let i = 0; i <= 80; i++)
                for (let j = 0; j <= 80 - i; j++) {
                    const weights = [i / 80, j / 80, 1 - (i + j) / 80];
                    const p = { x: 0, y: 0, z: 0 };
                    for (let k = 0; k < 3; k++) {
                        p.x += weights[k] * points[k].x;
                        p.y += weights[k] * points[k].y;
                        p.z += weights[k] * points[k].z;
                    }
                    const h2 = 4 - p.x * p.x - p.y * p.y;
                    if (h2 >= 0)
                        sampled = Math.max(
                            sampled,
                            p.z + (ball ? Math.sqrt(h2) : 0),
                        );
                }
            expect(actual).toBeGreaterThanOrEqual(sampled - 1e-7);
            if (Number.isFinite(sampled))
                expect(actual - sampled).toBeLessThan(0.35);
        }
    }
});

test('indexed and pruned contacts match an exhaustive triangle search', () => {
    let seed = 42;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    const positions = Float32Array.from(
        { length: 9 * 40 },
        () => random() * 20 - 10,
    );
    const query = createRotaryContact({ positions } as StlMesh, 3);
    for (let trial = 0; trial < 40; trial++) {
        const x = random() * 24 - 12;
        const angle = random() * 1440 - 720;
        const radius = 0.5 + random() * 2.5;
        const co = Math.cos((angle * Math.PI) / 180);
        const si = Math.sin((angle * Math.PI) / 180);
        const point = (i: number) => ({
            x: positions[i],
            y: positions[i + 2] * co - positions[i + 1] * si,
            z: positions[i + 2] * si + positions[i + 1] * co,
        });
        for (const ball of [false, true]) {
            let expected = -Infinity;
            for (let i = 0; i < positions.length; i += 9)
                expected = Math.max(
                    expected,
                    triangleContact(
                        point(i),
                        point(i + 3),
                        point(i + 6),
                        x,
                        radius,
                        ball,
                    ),
                );
            expect(query(x, angle, radius, ball)).toBe(expected);
        }
    }
});
