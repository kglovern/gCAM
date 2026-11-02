import { parseSvg } from './svg.js';
import { svgImagePlan } from './svg-image.js';
const url = 'data:image/png;base64,AA==';
const source = (attrs = '', parent = '', after = '') =>
    parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="80mm" viewBox="0 0 100 80">${parent}<image x="10" y="20" width="40" height="20" href="${url}" ${attrs}/>${after}</svg>`,
        { coordinateSpace: 'cam' },
    )[0];
test('axis-aligned image preserves source pixels and physical placement', () => {
    const s = source(),
        p = svgImagePlan(s, 8, 4)!;
    expect(p).toMatchObject({
        direct: true,
        flipY: false,
        x: 10,
        y: 40,
        w: 40,
        h: 20,
        rotation: 0,
    });
});
test('rotation stays an editable bitmap transform without regridding', () => {
    const p = svgImagePlan(source('transform="rotate(90 30 30)"'), 8, 4)!;
    expect(p.direct).toBe(true);
    expect(p.rotation).toBeCloseTo(-90, 10);
    expect(p.w).toBeCloseTo(40, 10);
    expect(p.h).toBeCloseTo(20, 10);
});
test('reflection requests a lossless pixel-axis flip', () => {
    const p = svgImagePlan(
        source('transform="translate(60 0) scale(-1 1)"'),
        8,
        4,
    );
    expect(p).toMatchObject({ direct: true, flipY: true });
});
test('meet uses image content bounds and slice is clipped to its positioning rectangle', () => {
    const meet = svgImagePlan(source(), 4, 4);
    expect(meet).toMatchObject({ direct: true, x: 20, y: 40, w: 20, h: 20 });
    const slice = svgImagePlan(
        source('preserveAspectRatio="xMidYMid slice"'),
        4,
        4,
    );
    expect(slice).toMatchObject({ direct: false, x: 10, y: 40, w: 40, h: 20 });
    const none = svgImagePlan(source('preserveAspectRatio="none"'), 4, 4);
    expect(none).toMatchObject({ direct: true, w: 40, h: 20 });
});
test('root and nested SVG viewports clip image content', () => {
    const root = source('transform="translate(-30 0)"');
    expect(svgImagePlan(root, 8, 4)).toMatchObject({
        direct: false,
        x: 0,
        w: 20,
    });
    const [nested] = parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80"><svg x="20" y="10" width="30" height="30"><image x="-10" width="60" height="30" href="${url}" preserveAspectRatio="none"/></svg></svg>`,
        { coordinateSpace: 'cam' },
    );
    expect(svgImagePlan(nested, 8, 4)).toMatchObject({
        direct: false,
        x: 20,
        y: 40,
        w: 30,
        h: 30,
    });
});
test('skewed images use a bounded axis-aligned raster with enough source detail', () => {
    const p = svgImagePlan(source('transform="skewX(30)"'), 8, 4);
    if (!p) throw new Error('Expected a visible skewed image.');
    expect(p.direct).toBe(false);
    expect((p.outW ?? 0) * (p.outH ?? 0)).toBeGreaterThan(32);
    expect((p.outW ?? 0) * (p.outH ?? 0)).toBeLessThan(16000000);
});
test('opacity multiplies through instance ancestry and hidden images are omitted', () => {
    expect(source('opacity="50%"', '<g opacity="0.5">', '</g>').opacity).toBe(
        0.25,
    );
    expect(source('style="display:none"')).toBeUndefined();
    expect(source('mask="url(#m)"', '<g opacity="0">', '</g>')).toBeUndefined();
});
test.each(['clip-path', 'mask', 'filter'])(
    'unsupported image %s fails explicitly',
    (property) => {
        expect(() => source(`${property}="url(#x)"`)).toThrow(
            'not supported yet',
        );
    },
);
test('external data and unsupported formats are not silently dropped', () => {
    expect(() =>
        parseSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><image href="photo.jpg"/></svg>',
        ),
    ).toThrow('embedded PNG or JPEG');
    expect(() =>
        parseSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml,abc"/></svg>',
        ),
    ).toThrow('embedded PNG or JPEG');
});
test('image clones inherit the instance viewport and PNG/JPEG href precedence', () => {
    const images = parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 80"><defs><image id="p" x="10%" y="20%" width="20%" height="20%" xlink:href="${url}"/></defs><use href="#p" x="5"/><image href="data:image/jpeg;base64,AA==" xlink:href="${url}"/></svg>`,
        { coordinateSpace: 'cam' },
    );
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ x: 10, y: 16, width: 20, height: 16 });
    expect(images[1].dataUrl).toMatch(/^data:image\/jpeg/);
});
test('intrinsic and single-dimension images retain their aspect ratio', () => {
    const s = { ...source(), width: null, height: 10 };
    expect(svgImagePlan(s, 8, 4)).toMatchObject({ w: 20, h: 10 });
    expect(svgImagePlan({ ...s, height: null }, 8, 4)).toMatchObject({
        w: 8,
        h: 4,
    });
});
test('degenerate transforms and oversized pixels fail before canvas allocation', () => {
    expect(() => svgImagePlan(source('transform="scale(0)"'), 8, 4)).toThrow(
        'image transform',
    );
    expect(() => svgImagePlan(source(), 4001, 4000)).toThrow('pixel limit');
    expect(() => svgImagePlan(source(), 16000000, 1)).toThrow('pixel limit');
    const s = source('transform="matrix(1 0 1 0.000001 0 0)"');
    expect(() => svgImagePlan(s, 4000, 4000)).toThrow('pixel limit');
});

test('inline declarations honour order, important priority and inheritance', () => {
    expect(
        source('style="opacity:.25;opacity:.5!important;opacity:.9"').opacity,
    ).toBe(0.5);
    expect(
        source('style="opacity:inherit"', '<g opacity="0.5">', '</g>').opacity,
    ).toBe(0.25);
    expect(
        source('visibility="inherit"', '<g visibility="hidden">', '</g>'),
    ).toBeUndefined();
    expect(
        source('visibility="visible"', '<g visibility="hidden">', '</g>'),
    ).toBeDefined();
});
test('unresolved opacity expressions fail rather than changing image power', () => {
    expect(() => source('style="opacity:var(--tone)"')).toThrow(
        'opacity expressions',
    );
});
