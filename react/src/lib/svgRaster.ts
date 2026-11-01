import { svgDocumentSpace } from '../engine/svg-document.js';
import { pngPhysicalSize } from '../platform/processedImagePng';

/** SVG stays in an image context, never attached as an interactive document. */
export function prepareSvgRaster(text: string, dpi: number) {
    if (!Number.isFinite(dpi) || dpi < 25 || dpi > 2400)
        throw new Error('Choose a resolution from 25 to 2400 DPI.');
    if (text.length > 16000000)
        throw new Error('SVG source exceeds 16 million characters.');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.doctype)
        throw new Error('SVG document types and entities are not supported.');
    if (
        doc.querySelector('parsererror') ||
        root.localName !== 'svg' ||
        root.namespaceURI !== 'http://www.w3.org/2000/svg'
    )
        throw new Error('Invalid SVG.');
    const elements = [root, ...root.querySelectorAll('*')];
    if (elements.length > 100000)
        throw new Error('SVG contains too many elements.');
    const localResource = (value: string) =>
        value.startsWith('#') ||
        /^data:image\/(?:png|jpeg)(?:;[^,]*)?,/i.test(value);
    const styles: string[] = [];
    for (const node of elements) {
        if (node.localName === 'style') styles.push(node.textContent ?? '');
        if (
            [
                'script',
                'foreignObject',
                'animate',
                'animateMotion',
                'animateTransform',
                'set',
            ].includes(node.localName)
        )
            throw new Error(
                'Use a static SVG without scripts, animation or embedded HTML.',
            );
        for (const attribute of [...node.attributes]) {
            if (/^on/i.test(attribute.localName))
                throw new Error('SVG event handlers are not supported.');
            if (
                [
                    'style',
                    'fill',
                    'stroke',
                    'clip-path',
                    'mask',
                    'filter',
                    'cursor',
                ].includes(attribute.localName)
            )
                styles.push(attribute.value);
            if (
                attribute.localName === 'href' &&
                node.localName !== 'a' &&
                attribute.value.trim() &&
                !localResource(attribute.value.trim())
            ) {
                throw new Error(
                    'Embed external images and references before importing this SVG.',
                );
            }
        }
    }
    const css = styles.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    if (
        /<\?xml-stylesheet/i.test(text) ||
        /@import|@keyframes|(?:^|[;{\s])(?:animation|transition)(?:-[a-z]+)?\s*:/i.test(
            css,
        )
    )
        throw new Error(
            'External stylesheets and animation are not supported.',
        );
    for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        if (!localResource(match[2].trim()))
            throw new Error('Embed external SVG resources before importing.');
    }
    const space = svgDocumentSpace(root);
    const wMm = space.size.x * space.scale,
        hMm = space.size.y * space.scale;
    const width = Math.round((wMm * dpi) / 25.4),
        height = Math.round((hMm * dpi) / 25.4);
    if (
        !space.rendered ||
        ![width, height].every(
            (n) => Number.isSafeInteger(n) && n > 0 && n <= 16384,
        ) ||
        width * height > 16000000
    )
        throw new Error(
            'Rendered image exceeds pixel limits or is empty. Lower the DPI (16 million pixels, 16,384 per side).',
        );
    root.setAttribute('width', `${wMm}mm`);
    root.setAttribute('height', `${hMm}mm`);
    return {
        source: new XMLSerializer().serializeToString(root),
        width,
        height,
        wMm,
        hMm,
    };
}

export async function rasterizeSvg(file: File, dpi: number): Promise<File> {
    const plan = prepareSvgRaster(await file.text(), dpi);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Could not render this SVG.'));
        image.src =
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(plan.source);
    });
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D is unavailable.');
        ctx.drawImage(image, 0, 0, plan.width, plan.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (value) =>
                    value
                        ? resolve(value)
                        : reject(new Error('Could not encode this SVG.')),
                'image/png',
            ),
        );
        const bytes = pngPhysicalSize(
            new Uint8Array(await blob.arrayBuffer()),
            plan.wMm,
            plan.hMm,
        );
        return new File([bytes], file.name.replace(/\.svg$/i, '') + '.png', {
            type: 'image/png',
        });
    } finally {
        canvas.width = canvas.height = 0;
    }
}
