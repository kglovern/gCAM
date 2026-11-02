import { parseSvg } from './svg.js';
import { svgUseResolver } from './svg-use.js';
import { svgLengthReader } from './svg-lengths.js';
const read = (body: string) =>
    parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100">${body}</svg>`,
    );
const line = '<line id="part" x1="1" y1="2" x2="11" y2="12"/>';

test('unused definitions and symbols stay unrendered', () => {
    expect(
        read(
            `<defs>${line}<use href="missing.svg#x"/></defs><symbol id="unused"><use href="#unused"/></symbol>`,
        ),
    ).toEqual([]);
});
test('clones preserve source transforms without inheriting the definition ancestors', () => {
    const [result] = read(
        `<defs transform="translate(100 100)" stroke="red"><g id="part" transform="scale(2)"><line x1="1" y1="2" x2="11" y2="12"/></g></defs><g transform="translate(3 4)" stroke="blue"><use href="#part" x="10" y="20" transform="scale(3)"/></g>`,
    );
    expect(result).toMatchObject({
        x1: 39,
        y1: 76,
        x2: 99,
        y2: 136,
        layerColor: '#0000ff',
    });
});
test('nested clones compose translations and resolve originals consistently', () => {
    const results = read(
        `<defs>${line}<g id="pair"><use href="#part" x="10"/><use href="#part" y="20"/></g></defs><use href="#pair" x="30"/><use href="#pair" x="60"/>`,
    );
    expect(results.map((p) => [p.x1, p.y1])).toEqual([
        [41, 2],
        [31, 22],
        [71, 2],
        [61, 22],
    ]);
});
test('cloned percentages use the instance viewport, not the original ancestors', () => {
    const [result] = read(
        '<defs><svg viewBox="0 0 10 10"><line id="part" x1="10%" y1="20%" x2="50%" y2="50%"/></svg></defs><svg x="5" y="7" width="80" height="40" viewBox="0 0 40 20"><use href="#part" x="10%" width="1000" height="1000"/></svg>',
    );
    expect(result).toMatchObject({ x1: 21, y1: 15, x2: 53, y2: 27 });
});
test('symbol instances have independent dimensions and percentage resolution', () => {
    const results = read(
        '<symbol id="part" viewBox="10 20 20 10"><line x1="10" y1="20" x2="100%" y2="100%"/></symbol><use href="#part" x="5" y="7" width="80" height="30"/><use href="#part" x="100" y="50" width="40" height="40"/>',
    );
    expect(results[0]).toMatchObject({ x1: 15, y1: 7, x2: 45, y2: -23 });
    expect(results[1]).toMatchObject({ x1: 100, y1: 60, x2: 120, y2: 40 });
});
test('use dimensions override svg dimensions while auto retains them', () => {
    const results = read(
        '<defs><svg id="part" x="2" y="3" width="40" height="20" viewBox="0 0 20 10"><line x2="20" y2="10"/></svg></defs><use href="#part" x="5" y="7" width="80" height="40"/><use href="#part" width="auto" height="auto"/>',
    );
    expect(results[0]).toMatchObject({ x1: 7, y1: 10, x2: 87, y2: 50 });
    expect(results[1]).toMatchObject({ x1: 2, y1: 3, x2: 42, y2: 23 });
});
test('zero dimensions disable symbol instances but do not disable simple shapes', () => {
    expect(
        read(
            `<defs>${line}</defs><symbol id="s">${line.replace('id="part"', '')}</symbol><use href="#s" width="0"/><use href="#part" width="0" height="0"/>`,
        ),
    ).toHaveLength(1);
});
test('href overrides xlink including an empty href; percent-encoded IDs resolve', () => {
    const results = read(
        `<defs>${line}<line id="two" x2="20" y2="20"/><line id="snow man" x2="30" y2="30"/></defs><use xlink:href="#part"/><use href="#two" xlink:href="#part"/><use href="" xlink:href="#part"/><use href="#snow%20man"/>`,
    );
    expect(results.map((p) => p.x2)).toEqual([11, 20, 30]);
});
test('instance layers and colours use the clone ancestry and explicit source colour wins', () => {
    const results = read(
        `<defs stroke="red">${line}<line id="coloured" stroke="green" x2="20" y2="20"/></defs><g id="cuts" data-name="Cut shapes" stroke="#123456"><use href="#part"/><use href="#coloured"/></g>`,
    );
    expect(results[0]).toMatchObject({
        layer: 'cuts',
        layerName: 'Cut shapes',
        layerColor: '#123456',
    });
    expect(results[1]).toMatchObject({
        layer: 'cuts',
        layerName: 'Cut shapes',
        layerColor: '#008000',
    });
});
test.each([
    '<use id="a" href="#a"/>',
    '<defs><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g></defs><use href="#a"/>',
    '<g id="a"><line x2="10"/><use href="#a"/></g>',
])('rejects circular reference %s', (body) =>
    expect(() => read(body)).toThrow('Circular SVG use'),
);
test.each([
    'https://example.com/part.svg#x',
    'part.svg#x',
    'data:image/svg+xml,x',
    'file:///part.svg#x',
])('rejects external reference %s', (href) =>
    expect(() => read(`<use href="${href}"/>`)).toThrow('External SVG use'),
);
test('missing, malformed and unsupported targets fail explicitly', () => {
    expect(() => read('<use href="#absent"/>')).toThrow('was not found');
    expect(() => read('<use href="#bad%ZZ"/>')).toThrow('Invalid SVG use');
    expect(() =>
        read('<defs><text id="t">Name</text></defs><use href="#t"/>'),
    ).toThrow('Convert it to paths');
});
test('reference depth is bounded before unbounded recursion', () => {
    const defs = Array.from(
        { length: 70 },
        (_, i) =>
            `<g id="p${i}">${i === 69 ? line : `<use href="#p${i + 1}"/>`}</g>`,
    ).join('');
    expect(() => read(`<defs>${defs}</defs><use href="#p0"/>`)).toThrow(
        'too deeply nested',
    );
});
test('expanding repeated references has a cumulative node limit', () => {
    const defs = Array.from(
        { length: 20 },
        (_, i) =>
            `<g id="p${i}">${i === 19 ? line : `<use href="#p${i + 1}"/><use href="#p${i + 1}"/>`}</g>`,
    ).join('');
    expect(() => read(`<defs>${defs}</defs><use href="#p0"/>`)).toThrow(
        'expansion is too large',
    );
}, 30000);
test('temporary clones are removed on failure and a later visit still resolves', () => {
    const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg"><defs>${line}</defs><use href="#part"/></svg>`,
        'image/svg+xml',
    );
    const resolve = svgUseResolver(doc, svgLengthReader()),
        use = doc.querySelector('use')!;
    const before = doc.documentElement.outerHTML;
    expect(() =>
        resolve(use, () => {
            throw new Error('cancelled');
        }),
    ).toThrow('cancelled');
    expect(doc.documentElement.outerHTML).toEqual(before);
    let visited = false;
    resolve(use, (clone: Element) => {
        visited = clone.localName === 'line';
    });
    expect(visited).toBe(true);
    expect(doc.documentElement.outerHTML).toEqual(before);
});

test('repeating large attribute payloads is bounded before cloning them', () => {
    const payload = 'x'.repeat(1000000);
    const body = `<defs><line id="p" data-payload="${payload}" x2="1"/></defs>${'<use href="#p"/>'.repeat(40)}`;
    expect(() => read(body)).toThrow('expansion is too large');
}, 15000);

test('namespace-prefixed SVG elements and legacy href prefixes resolve normally', () => {
    const [result] = parseSvg(
        '<s:svg xmlns:s="http://www.w3.org/2000/svg" xmlns:link="http://www.w3.org/1999/xlink" viewBox="0 0 200 100"><s:defs><s:symbol id="part" viewBox="0 0 20 10"><s:line x1="10%" y1="20%" x2="100%" y2="100%"/></s:symbol></s:defs><s:use link:href="#part" x="5" y="7" width="40" height="20"/></s:svg>',
    );
    expect(result).toMatchObject({ x1: 9, y1: 11, x2: 45, y2: 27 });
});
