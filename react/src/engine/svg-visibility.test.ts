import { parseSvg } from './svg.js';

const read = (body: string) =>
    parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
    );
const line = '<line x1="1" y1="2" x2="10" y2="20"/>';

test.each([
    'display="none"',
    'style="display:none"',
    'opacity="0"',
    'opacity="0%"',
    'visibility="hidden"',
    'visibility="collapse"',
])('does not import hidden vectors: %s', (attrs) => {
    expect(read(`<g ${attrs}>${line}</g>`)).toEqual([]);
});

test('a visible child can override hidden visibility, but not a non-rendered ancestor', () => {
    expect(
        read(
            `<g visibility="hidden"><g visibility="visible">${line}</g>${line}</g>`,
        ),
    ).toHaveLength(1);
    for (const attrs of ['display="none"', 'opacity="0"']) {
        expect(
            read(
                `<g ${attrs}><g style="display:inline;visibility:visible;opacity:1">${line}</g></g>`,
            ),
        ).toEqual([]);
    }
});

test('inline declarations override presentation attributes with importance and declaration order', () => {
    expect(
        read(
            `<g visibility="hidden" style="visibility:visible!important;visibility:hidden">${line}</g>`,
        ),
    ).toHaveLength(1);
    expect(
        read(`<g display="none" style="display:inline">${line}</g>`),
    ).toHaveLength(1);
    expect(
        read(`<g style="display:none!important;display:inline">${line}</g>`),
    ).toEqual([]);
});

test('clone visibility follows instance ancestry and explicit descendant overrides', () => {
    expect(
        read(
            `<defs><g id="part">${line}<g visibility="visible">${line}</g></g></defs><use href="#part" visibility="hidden"/>`,
        ),
    ).toHaveLength(1);
    expect(
        read(
            `<defs><g id="part">${line}</g></defs><use href="#part" display="none"/>`,
        ),
    ).toEqual([]);
});

test('hidden subtrees do not resolve broken references or invalid geometry', () => {
    expect(
        read('<g display="none"><use href="#missing"/><path d="broken"/></g>'),
    ).toEqual([]);
});

test('nonzero vector opacity retains geometry without silently changing laser settings', () => {
    expect(read(`<g opacity=".2">${line}</g>`)).toEqual(read(line));
});

test('keyword case, whitespace and invalid opacity attributes follow SVG presentation rules', () => {
    expect(read(`<g visibility=" HIDDEN ">${line}</g>`)).toEqual([]);
    expect(read(`<g opacity="0broken">${line}</g>`)).toEqual(read(line));
    expect(read(`<g style="visibility:HIDDEN">${line}</g>`)).toEqual([]);
});
