import {
    bitmapHeightmap,
    type BitmapHeightmapRequest,
} from './bitmap-heightmap';
import { transformStoredSurfaceMesh } from '../engine/surface-model';

const make = (extra: Partial<BitmapHeightmapRequest> = {}) =>
    bitmapHeightmap({
        image: {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray([
                0, 0, 0, 255, 255, 255, 255, 255, 64, 64, 64, 255, 128, 128,
                128, 255,
            ]),
        },
        widthMm: 20,
        heightMm: 10,
        reliefMm: 3,
        spacingMm: 0.5,
        invert: false,
        fileName: 'relief.png',
        ...extra,
    });

test('maps image top to positive Y and white to high Z without changing source pixels', () => {
    const mesh = make();
    expect(mesh.vertices).toHaveLength(18);
    const at = (x: number, y: number) =>
        mesh.vertices.filter(
            (_, index) =>
                index % 3 === 2 &&
                mesh.vertices[index - 2] === x &&
                mesh.vertices[index - 1] === y,
        );
    expect(at(0, 10)[0]).toBe(0);
    expect(at(20, 10)[0]).toBeCloseTo(3, 12);
    expect(at(0, 0)[0]).toBeCloseTo((3 * 64) / 255, 12);
    expect(mesh.bounds).toEqual({
        minX: 0,
        maxX: 20,
        minY: 0,
        maxY: 10,
        minZ: 0,
        maxZ: 3,
    });
});

test('inverts heights and uses the existing XY/rotation/Z transformations', () => {
    const mesh = make({ invert: true });
    const transformed = transformStoredSurfaceMesh({
        x: 40,
        y: 60,
        w: 20,
        h: 10,
        rotation: 90,
        surfaceMesh: mesh,
    })!;
    expect(transformed.bounds).toMatchObject({
        minX: 45,
        maxX: 55,
        minY: 55,
        maxY: 75,
        minZ: -3,
        maxZ: 0,
    });
    const z = (x: number, y: number) => {
        const points = Array.from(transformed.vertices);
        return points.find(
            (_, i) => i % 3 === 2 && points[i - 2] === x && points[i - 1] === y,
        );
    };
    expect(z(45, 55)).toBe(0);
    expect(z(45, 75)).toBe(-3);
});

test('resamples bilinearly at bounded physical image spacing', () => {
    const data = new Uint8ClampedArray(5 * 3 * 4);
    for (let y = 0; y < 3; y++)
        for (let x = 0; x < 5; x++)
            data.set([x * 50, x * 50, x * 50, 255], (y * 5 + x) * 4);
    const before = Array.from(data);
    const result = make({
        image: { width: 5, height: 3, data },
        widthMm: 6,
        heightMm: 2,
        spacingMm: 2,
    });
    expect(result.vertices).toHaveLength(3 * 1 * 18);
    expect(result.vertices[5]).toBeCloseTo((3 * (200 / 3)) / 255, 10);
    expect(Array.from(data)).toEqual(before);
});

test('rejects ambiguous transparency, flat maps, excessive detail and invalid dimensions before creating a mesh', () => {
    const image = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 255, 255, 128]),
    };
    expect(() => make({ image })).toThrow('opaque');
    image.data[3] = 255;
    expect(() => make({ image })).toThrow('variation');
    expect(() => make({ reliefMm: NaN })).toThrow('positive');
    expect(() => make({ widthMm: 0 })).toThrow('positive');
    expect(() =>
        make({
            image: {
                width: 4001,
                height: 4000,
                data: new Uint8ClampedArray(0),
            },
        }),
    ).toThrow('16 million');
    expect(() =>
        make({
            image: {
                width: 1000,
                height: 1000,
                data: new Uint8ClampedArray(4_000_000),
            },
            spacingMm: 0.001,
        }),
    ).toThrow('too fine');
});
