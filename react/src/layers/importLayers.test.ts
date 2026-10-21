import { importVectorFile } from '../lib/import';
import { parseSvg } from '../engine/svg.js';
import { dxfLayerMetadata } from './importMetadata.js';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="100mm" viewBox="0 0 100 100">
<g id="layer1" inkscape:groupmode="layer" inkscape:label="Cuts" stroke="#f00"><g id="nested"><rect id="shape1" width="20" height="20" /></g></g>
<g id="layer2" inkscape:groupmode="layer" inkscape:label="Pockets" stroke="#f00"><rect width="20" height="20" /></g>
<rect id="not-a-layer" x="40" width="20" height="20" /></svg>`;
test('SVG named layers retain names and inherited colours without treating shape ids as layers', async () => {
    const result = await importVectorFile(new File([svg], 'layers.svg'));
    expect(result.layers).toEqual([
        { id: 'default', name: 'Default' },
        { id: 'import:layer1', name: 'Cuts', color: '#ff0000' },
        { id: 'import:layer2', name: 'Pockets', color: '#ff0000' },
    ]);
    expect(result.loops).toHaveLength(3);
    expect(result.loops.map((loop) => loop.layerId)).toEqual([
        'import:layer1',
        'import:layer2',
        'default',
    ]);
});
test('plain SVG groups are usable layers and colour alone does not invent layers', () => {
    const entities = parseSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g id="Cuts"><line x2="10" stroke="red" /></g><line id="shape" x2="10" stroke="blue" /></svg>',
    );
    expect(entities.map((entity) => entity.layer)).toEqual(['Cuts', '0']);
});
const dxf = [
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '0',
    'LAYER',
    '2',
    'Cuts',
    '62',
    '1',
    '0',
    'LAYER',
    '2',
    'Pockets',
    '62',
    '3',
    '420',
    '255',
    '0',
    'LAYER',
    '2',
    'Empty',
    '62',
    '2',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...['Cuts', 'Pockets'].flatMap((layer) => [
        '0',
        'LINE',
        '8',
        layer,
        '10',
        '0',
        '20',
        '0',
        '11',
        '10',
        '21',
        '0',
    ]),
    '0',
    'ENDSEC',
    '0',
    'EOF',
].join('\n');
test('DXF BYLAYER and true colours and empty named layers survive import', async () => {
    expect(dxfLayerMetadata(dxf).get('Pockets')?.color).toBe('#0000ff');
    const result = await importVectorFile(new File([dxf], 'layers.dxf'));
    expect(result.layers?.map((layer) => layer.name)).toEqual([
        'Default',
        'Cuts',
        'Pockets',
        'Empty',
    ]);
    expect(result.loops).toHaveLength(2);
    expect(new Set(result.loops.map((loop) => loop.layerId)).size).toBe(2);
});
