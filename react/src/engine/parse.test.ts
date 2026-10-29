/**
 * Tests: parseDxf reads an LWPOLYLINE square; buildLoops closes the square with correct area and perimeter; parseSvg reads rect and circle without DOM measurement; relative subpath moves keep their absolute position; compact transform lists parse.
 */
import { parseDxf } from './dxf.js';
import { absolutizeSubpathStarts, parseSvg } from './svg.js';
import { parseSvgTransform } from '../geometry/matrix.js';
import {
    boundsOfEntities,
    buildLoops,
    polygonArea,
    polylineLength,
} from './paths.js';

const SQUARE_DXF = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LWPOLYLINE',
    '8',
    '0',
    '90',
    '4',
    '70',
    '1',
    '10',
    '0.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '20.0',
    '10',
    '0.0',
    '20',
    '20.0',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
].join('\n');

const SHAPES_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">',
    '<rect x="10" y="10" width="20" height="20"/>',
    '<circle cx="60" cy="60" r="10"/>',
    '</svg>',
].join('\n');

test('parseDxf reads an LWPOLYLINE square', () => {
    const entities = parseDxf(SQUARE_DXF);
    expect(entities).toHaveLength(1);
    expect(entities[0].vertices).toHaveLength(4);
    const bounds = boundsOfEntities(entities);
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(20);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(20);
});

test('parseDxf preserves TEXT and MTEXT content and applies inline height', () => {
    const dxf = [
        '0',
        'SECTION',
        '2',
        'ENTITIES',
        '0',
        'TEXT',
        '10',
        '5',
        '20',
        '10',
        '40',
        '2',
        '1',
        'A1',
        '0',
        'MTEXT',
        '10',
        '20',
        '20',
        '30',
        '40',
        '3',
        '71',
        '1',
        '1',
        '\\H2x;Title\\PSecond line',
        '0',
        'ENDSEC',
        '0',
        'EOF',
        '',
    ].join('\n');
    const entities = parseDxf(dxf);
    expect(entities).toHaveLength(2);
    expect(entities.map((entity) => entity.type)).toEqual([
        'CAD_TEXT',
        'CAD_TEXT',
    ]);
    expect(entities[1].text).toBe('Title\nSecond line');
    expect(entities[1].height).toBe(6);
    expect(entities[1].fontStyle).toBe('');
    expect(entities[1].strokes).toEqual([]);
});

test('buildLoops closes the square with correct area and perimeter', () => {
    const entities = parseDxf(SQUARE_DXF);
    const loops = buildLoops(entities);
    expect(loops.length).toBeGreaterThanOrEqual(1);
    const loop = loops[0];
    expect(loop.points.length).toBeGreaterThanOrEqual(4);
    expect(Math.abs(polygonArea(loop.points))).toBeCloseTo(400, 0);
    expect(polylineLength(loop.points)).toBeCloseTo(80, 0);
});

test('parseSvg reads rect and circle without DOM measurement', () => {
    const entities = parseSvg(SHAPES_SVG);
    expect(entities.length).toBeGreaterThanOrEqual(2);
    const bounds = boundsOfEntities(entities);
    expect(bounds.minX).toBeCloseTo(10);
    expect(bounds.maxX).toBeCloseTo(70);
});

test('relative subpath moves continue from the closed subpath start', () => {
    expect(
        absolutizeSubpathStarts(['M10 10 h5 v5 z', 'm20 0 h5 v5 z']),
    ).toEqual(['M10 10 h5 v5 z', 'M30 10 h5 v5 z']);
});

test('relative subpath moves continue from an open subpath end', () => {
    expect(absolutizeSubpathStarts(['M10 10 l5 5', 'm1 1 l2 0'])[1]).toBe(
        'M16 16 l2 0',
    );
});

test('extra pairs after a relative move stay relative line segments', () => {
    expect(absolutizeSubpathStarts(['M0 0 z', 'm1 1 2 2'])[1]).toBe(
        'M1 1 l2 2',
    );
});

test('relative curves, arcs and axis lines move the current point', () => {
    const [, second] = absolutizeSubpathStarts([
        'M0 0 c1 1 2 2 3 3 a5 5 0 0110 10 h2 v-1',
        'm1 1 z',
    ]);
    expect(second).toBe('M16 13 z');
});

test('absolute subpath starts are left untouched', () => {
    expect(absolutizeSubpathStarts(['M0 0 h1 z', 'M5 5 h1 z'])[1]).toBe(
        'M5 5 h1 z',
    );
});

test('parseSvgTransform reads compact number lists', () => {
    expect(parseSvgTransform('translate(10-5)')).toMatchObject({
        e: 10,
        f: -5,
    });
});
