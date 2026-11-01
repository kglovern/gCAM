import {
    buildCutDepthPreview,
    cutDepthPixels,
    segmentCutDepth,
} from './cut-depth-preview';
import { createToolpathFromLoops } from '../cam/cam-ops.js';
import { makeToolpathConfig } from '../toolpaths/toolpathRequest';
import { pointAtDistance } from '../geometry/primitives.js';
import { pocketDepthRGB } from '../canvas/pocketDepthPreview';
const square = {
    points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
        { x: 0, y: 0 },
    ],
};
const job = (operation = 'profile-outside', extra = {}) =>
    createToolpathFromLoops(
        [square],
        makeToolpathConfig({
            operation,
            toolDiameter: 4,
            cutDepth: 6,
            passDepth: 6,
            tabHeight: 0,
            ...extra,
        }),
    );
function pixel(
    image: ReturnType<typeof buildCutDepthPreview>,
    x: number,
    y: number,
) {
    const col = Math.floor((x - image.minX) / image.cellMm),
        row = Math.floor((image.maxY - y) / image.cellMm),
        i = (row * image.width + col) * 4;
    return [...image.light.slice(i, i + 4)];
}
test.each(['flat', 'ball', 'v-bit'])(
    'swept %s depth agrees with independent dense cutter samples on a sloping XYZ move',
    (type) => {
        const a = { x: 0, y: 0, z: -1 },
            b = { x: 10, y: 3, z: -5 },
            tool = { type, radius: 3, angle: 60 };
        for (const p of [
            { x: 1, y: 1 },
            { x: 5, y: 0 },
            { x: 11, y: 4 },
            { x: 7, y: 3 },
        ]) {
            let reference = 0;
            for (let i = 0; i <= 10000; i++) {
                const t = i / 10000,
                    r = Math.hypot(
                        p.x - a.x - t * (b.x - a.x),
                        p.y - a.y - t * (b.y - a.y),
                    );
                if (r > 3) continue;
                const rise =
                    type === 'flat'
                        ? 0
                        : type === 'ball'
                          ? 3 - Math.sqrt(9 - r * r)
                          : r / Math.tan(Math.PI / 6);
                reference = Math.max(reference, -a.z + t * (a.z - b.z) - rise);
            }
            expect(segmentCutDepth(p, a, b, tool)).toBeCloseTo(reference, 2);
        }
    },
);
test('profile kerfs preserve interior material and show remaining tabs lighter than through cuts', () => {
    const t = job(),
        before = JSON.stringify(t);
    t.tabs = [{ contourIndex: 0, along: 20 }];
    t.tabWidth = 8;
    t.tabHeight = 2;
    const image = buildCutDepthPreview([t], 6),
        tab = pointAtDistance(t.previewContours[0], 20),
        deep = pointAtDistance(t.previewContours[0], 55);
    expect(pixel(image, 10, 10)[3]).toBe(0);
    const tabPixel = pixel(image, tab.x, tab.y),
        throughPixel = pixel(image, deep.x, deep.y);
    expect(tabPixel[3]).toBe(255);
    expect(throughPixel[3]).toBe(255);
    for (let c = 0; c < 3; c++) {
        expect(tabPixel[c]).toBeGreaterThan(throughPixel[c]);
        expect(tabPixel[c]).toBeLessThanOrEqual(pocketDepthRGB(4, false)[c]);
        expect(throughPixel[c]).toBeLessThanOrEqual([100, 116, 139][c]);
    }
    expect(image.width).toBeLessThanOrEqual(1024);
    expect(image.height).toBeLessThanOrEqual(1024);
    const { tabs: _tabs, tabWidth: _width, tabHeight: _height, ...rest } = t;
    const original = JSON.parse(before);
    delete original.tabs;
    delete original.tabWidth;
    delete original.tabHeight;
    expect(rest).toEqual(original);
});
test('engraved V-groove width follows angle/depth and chamfers shade only the material side', () => {
    const line = {
        points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
        ],
    };
    const engrave = createToolpathFromLoops(
        [line],
        makeToolpathConfig({
            operation: 'engrave',
            toolDiameter: 6,
            cutDepth: 2,
            passDepth: 2,
            cutterAngle: 90,
        }),
    );
    const image = buildCutDepthPreview([{ ...engrave, cutterType: 'v-bit' }]);
    expect(pixel(image, 10, 0)[3]).toBe(255);
    expect(pixel(image, 10, 2.5)[3]).toBe(0);
    const bevel = job('chamfer', {
        toolDiameter: 6,
        chamferWidthMm: 1,
        chamferTipOffsetMm: 0.5,
        cutterAngle: 90,
    });
    const cut = buildCutDepthPreview([{ ...bevel, cutterType: 'v-bit' }]);
    expect(pixel(cut, -0.5, 10)[3]).toBe(0);
    expect(pixel(cut, 0.3, 10)[3]).toBe(255);
    expect(pixel(cut, 2, 10)[3]).toBe(0);
});
test('variable-Z V-carving tapers instead of painting a constant-width slot; input and exports stay untouched', () => {
    const t = {
        ...job('engrave'),
        operation: 'vcarve',
        emission: 'vcarve',
        cutterType: 'v-bit',
        cutterAngle: 90,
        cutDepth: 3,
        motionPaths: [
            {
                points: [
                    { x: 0, y: 0, z: 0 },
                    { x: 10, y: 0, z: -3 },
                    { x: 20, y: 0, z: 0 },
                ],
            },
        ],
    };
    const before = JSON.stringify(t),
        image = buildCutDepthPreview([t]);
    expect(pixel(image, 1, 1.5)[3]).toBe(0);
    expect(pixel(image, 10, 1.5)[3]).toBe(255);
    expect(JSON.stringify(t)).toBe(before);
});
test('inner shadows fade across a constant-depth floor without changing the cut footprint', () => {
    const depths = new Float32Array(80 * 40);
    for (let y = 1; y < 40; y++)
        for (let x = 1; x < 80; x++) depths[y * 80 + x] = 4;
    const colors = cutDepthPixels(depths, 80, 40, 12, 0.1);
    for (const pixels of [colors.light, colors.dark]) {
        const at = (x: number) => pixels[(30 * 80 + x) * 4];
        expect(at(1)).toBeLessThan(at(7));
        expect(at(7)).toBeLessThan(at(30));
        expect(pixels[3]).toBe(0);
        expect(pixels[(30 * 80 + 1) * 4 + 3]).toBe(255);
    }
});
test('composites keep the deepest overlap and retain transparent untouched pixels in both themes', () => {
    const a = job('engrave', { cutDepth: 2 }),
        b = job('engrave', { cutDepth: 4 });
    const one = buildCutDepthPreview([b]),
        both = buildCutDepthPreview([a, b]);
    expect([...both.light]).toEqual([...one.light]);
    const colors = cutDepthPixels(new Float32Array([0, 4, 6]), 3, 1, 6);
    expect(colors.light[3]).toBe(0);
    expect(colors.dark[3]).toBe(0);
    expect([...colors.dark.slice(8, 11)]).toEqual([4, 6, 12]);
    expect(() =>
        buildCutDepthPreview([{ ...a, operation: 'laser-cut' }]),
    ).toThrow('Unsupported');
    expect(() => buildCutDepthPreview([a], 0)).toThrow('stock');
});
