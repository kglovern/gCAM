/** Source layer identities are independent of optional display colours. */
export function svgLayerMetadata(element) {
    let group = null;
    let namedGroup = null;
    let strokeColor;
    let fillColor;
    for (let node = element; node; node = node.parentElement) {
        if (!strokeColor || !fillColor) {
            const style = node.getAttribute('style') || '';
            const stroke =
                style.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/i)?.[1] ||
                node.getAttribute('stroke');
            const fill =
                style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i)?.[1] ||
                node.getAttribute('fill');
            strokeColor ||= svgColor(stroke);
            fillColor ||= svgColor(fill);
        }
        if (node.localName === 'g') {
            const mode =
                node.getAttributeNS(
                    'http://www.inkscape.org/namespaces/inkscape',
                    'groupmode',
                ) || node.getAttribute('inkscape:groupmode');
            if (!group && mode === 'layer') group = node;
            if (
                !namedGroup &&
                (node.getAttribute('id') || node.getAttribute('data-name'))
            )
                namedGroup = node;
        }
    }
    group ||= namedGroup;
    const name =
        group?.getAttributeNS(
            'http://www.inkscape.org/namespaces/inkscape',
            'label',
        ) ||
        group?.getAttribute('inkscape:label') ||
        group?.getAttribute('data-name') ||
        group?.getAttribute('id') ||
        '0';
    return {
        layer: group?.getAttribute('id') || name,
        layerName: name,
        layerColor: strokeColor || fillColor,
    };
}
function svgColor(value) {
    if (!value) return undefined;
    value = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(value)) return value;
    if (/^#[0-9a-f]{3}$/.test(value))
        return '#' + [...value.slice(1)].map((c) => c + c).join('');
    const rgb = value.match(
        /^rgb\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*\)$/,
    );
    if (rgb)
        return (
            '#' +
            rgb
                .slice(1)
                .map((n) =>
                    Math.min(255, Number(n)).toString(16).padStart(2, '0'),
                )
                .join('')
        );
    return {
        black: '#000000',
        white: '#ffffff',
        red: '#ff0000',
        green: '#008000',
        blue: '#0000ff',
        yellow: '#ffff00',
        cyan: '#00ffff',
        magenta: '#ff00ff',
    }[value];
}
/** DXF LAYER table, including BYLAYER indexed and true colour values. */
export function dxfLayerMetadata(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const layers = new Map();
    let current = null;
    let inTables = false;
    const flush = () => {
        if (current?.name) layers.set(current.name, current);
    };
    for (let i = 0; i + 1 < lines.length; i += 2) {
        const code = Number(lines[i].trim()),
            value = lines[i + 1].trim();
        if (code === 2 && value === 'TABLES') inTables = true;
        if (code === 0) {
            flush();
            current = inTables && value === 'LAYER' ? {} : null;
            if (value === 'ENDSEC') inTables = false;
        }
        if (!current) continue;
        if (code === 2) current.name = value;
        if (code === 62 && !current.trueColor)
            current.color = dxfIndexedColor(Math.abs(Number(value)));
        if (code === 420) {
            current.color = '#' + Number(value).toString(16).padStart(6, '0');
            current.trueColor = true;
        }
    }
    flush();
    return layers;
}
export function dxfIndexedColor(index) {
    const basic = [
        '#000000',
        '#ff0000',
        '#ffff00',
        '#00ff00',
        '#00ffff',
        '#0000ff',
        '#ff00ff',
        '#ffffff',
        '#808080',
        '#c0c0c0',
    ];
    if (index >= 1 && index < 10) return basic[index];
    if (index >= 250 && index <= 255)
        return [
            '#333333',
            '#505050',
            '#696969',
            '#828282',
            '#bebebe',
            '#ffffff',
        ][index - 250];
    if (index < 10 || index > 249) return undefined;
    const hue = Math.floor((index - 10) / 10) * 15;
    const value = [1, 1, 0.65, 0.65, 0.5, 0.5, 0.3, 0.3, 0.15, 0.15][
        (index - 10) % 10
    ];
    const saturation = index % 2 ? 0.5 : 1;
    const c = value * saturation,
        x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
        m = value - c;
    const rgb = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ][Math.floor(hue / 60)];
    return (
        '#' +
        rgb
            .map((n) =>
                Math.round((n + m) * 255)
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
    );
}
