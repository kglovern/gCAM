import { parseSvg } from './svg.js';
const read = (
    attributes: string,
    shape = '<line x1="10" y1="20" x2="30" y2="30"/>',
) =>
    parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><svg ${attributes}>${shape}</svg></svg>`,
    );
test.each([
    ['x="5" y="7"', [15, 27, 35, 37]],
    [
        'x="5" y="7" width="80" height="30" viewBox="10 20 20 10"',
        [15, 7, 75, 37],
    ],
    [
        'x="5" y="7" width="80" height="30" viewBox="10 20 20 10" preserveAspectRatio="none"',
        [5, 7, 85, 37],
    ],
    [
        'x="5" y="7" width="80" height="30" viewBox="10 20 20 10" preserveAspectRatio="xMaxYMax meet"',
        [25, 7, 85, 37],
    ],
    [
        'x="5" y="7" width="80" height="30" viewBox="10 20 20 10" preserveAspectRatio="xMinYMin slice"',
        [5, 7, 85, 47],
    ],
    [
        'x="10%" y="20%" width="40%" height="30%" viewBox="10 20 20 10"',
        [30, 20, 90, 50],
    ],
    ['x="5" y="7" transform="translate(2 3) scale(2)"', [32, 57, 72, 77]],
])('maps nested viewport %s', (attrs, expected) => {
    const entity = read(attrs as string)[0];
    expect([entity.x1, entity.y1, entity.x2, entity.y2]).toEqual(expected);
});
test('percentages inside meet and slice use the viewBox dimensions', () => {
    expect(
        read(
            'width="80" height="30" viewBox="0 0 20 10"',
            '<line x1="0" y1="0" x2="100%" y2="100%"/>',
        )[0],
    ).toMatchObject({ x1: 10, y1: 0, x2: 70, y2: 30 });
    expect(
        read(
            'width="80" height="30" viewBox="0 0 20 10" preserveAspectRatio="xMidYMid slice"',
            '<line x1="0" y1="0" x2="100%" y2="100%"/>',
        )[0],
    ).toMatchObject({ x1: 0, y1: -5, x2: 80, y2: 35 });
});
test('nested viewports compose through groups and another viewport', () => {
    const [line] = parseSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g transform="translate(3 4)"><svg x="10" y="20" width="80" height="40" viewBox="0 0 40 20"><svg x="25%" y="25%" width="50%" height="50%" viewBox="0 0 10 5"><line x2="10" y2="5"/></svg></svg></g></svg>',
    );
    expect(line).toMatchObject({ x1: 33, y1: 34, x2: 73, y2: 54 });
});
test.each([
    'width="0"',
    'height="0"',
    'viewBox="0 0 0 10"',
    'viewBox="0 0 10 0"',
])('omits zero-size viewport %s', (attrs) => expect(read(attrs)).toEqual([]));
test('invalid viewBox and alignment follow native fallback', () => {
    expect(read('x="5" viewBox="0 0 -2 3"')[0]).toMatchObject({
        x1: 15,
        y1: 20,
        x2: 35,
        y2: 30,
    });
    expect(
        read(
            'width="80" height="30" viewBox="10 20 20 10" preserveAspectRatio="wrong"',
        )[0],
    ).toMatchObject({ x1: 10, y1: 0, x2: 70, y2: 30 });
});
test('rejects viewport arithmetic overflow', () =>
    expect(() =>
        read(
            'x="1e308" width="1e308" height="10" viewBox="-100 0 1e-308 10" preserveAspectRatio="none"',
        ),
    ).toThrow('Invalid SVG viewport'));
