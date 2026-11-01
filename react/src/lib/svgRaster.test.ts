import { prepareSvgRaster } from './svgRaster';
const svg = (attrs = '', body = '<rect width="10" height="10"/>') =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

test('uses physical document dimensions and requested pixel density', () => {
    expect(
        prepareSvgRaster(
            svg('width="40mm" height="30mm" viewBox="0 0 40 30"'),
            254,
        ),
    ).toMatchObject({ width: 400, height: 300, wMm: 40, hMm: 30 });
    expect(
        prepareSvgRaster(svg('width="2in" height="1in"'), 100),
    ).toMatchObject({ width: 200, height: 100, wMm: 50.8, hMm: 25.4 });
    expect(prepareSvgRaster(svg('viewBox="0 0 96 48"'), 96)).toMatchObject({
        width: 96,
        height: 48,
        wMm: 25.4,
        hMm: 12.7,
    });
});

test('retains local clip/mask/filter definitions and presentation', () => {
    const body =
        '<defs><clipPath id="c"><circle r="10"/></clipPath><mask id="m"><rect width="10" height="10" fill="white"/></mask><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs><g clip-path="url(#c)" mask="url(#m)" filter="url(#f)" opacity=".5"><rect width="20" height="20"/></g>';
    const result = prepareSvgRaster(
        svg('width="40mm" height="30mm"', body),
        254,
    );
    for (const name of ['clipPath', 'mask', 'filter', 'opacity=".5"'])
        expect(result.source).toContain(name);
});

test.each([0, 24, 2401, Infinity, NaN])('rejects invalid DPI %s', (dpi) =>
    expect(() => prepareSvgRaster(svg(), dpi)).toThrow('resolution'),
);

test.each(['width="10000mm" height="10000mm"', 'width="0"', 'height="0"'])(
    'rejects excessive or empty raster size %s',
    (attrs) =>
        expect(() => prepareSvgRaster(svg(attrs), 254)).toThrow('pixel limits'),
);

test.each([
    '<image href="https://example.com/a.png"/>',
    '<use href="other.svg#part"/>',
    '<image href="data:image/svg+xml;base64,a"/>',
    '<style>@import "other.css";</style>',
    '<rect style="fill:url(https://example.com/paint.svg#p)"/>',
    '<script>evil()</script>',
    '<foreignObject/>',
    '<animate attributeName="x"/>',
    '<rect onclick="evil()"/>',
    '<style>@keyframes moving {}</style>',
])('rejects unsupported active/external SVG content %s', (body) =>
    expect(() => prepareSvgRaster(svg('', body), 254)).toThrow(),
);

test('rejects invalid XML, non-SVG documents and document types', () => {
    for (const source of [
        '<svg',
        '<html/>',
        '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>',
    ])
        expect(() => prepareSvgRaster(source, 254)).toThrow();
});

test('preserves hyperlink attributes used by appearance selectors and ignores metadata examples', () => {
    const result = prepareSvgRaster(
        svg(
            'width="40mm" height="30mm"',
            '<metadata>Examples: url(https://example.com/paint), @import</metadata><style>a[href]{fill:#333}</style><a href="https://example.com/"><rect width="10" height="10"/></a>',
        ),
        254,
    );
    expect(result.source).toContain('href="https://example.com/"');
});

test('validates decoded local CSS URLs rather than XML-escaped source text', () => {
    const source = svg(
        'width="40mm" height="30mm"',
        '<defs><clipPath id="c"><circle r="10"/></clipPath></defs><rect width="20" height="20" clip-path="url(&quot;#c&quot;)"/>',
    );
    expect(prepareSvgRaster(source, 254).source).toContain('clip-path=');
    expect(() =>
        prepareSvgRaster(source.replace('#c', 'https://example.com/c'), 254),
    ).toThrow('external SVG resources');
});
