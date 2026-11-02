const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TARGETS = new Set([
    'g',
    'svg',
    'symbol',
    'use',
    'line',
    'polyline',
    'polygon',
    'rect',
    'circle',
    'ellipse',
    'path',
    'image',
]);
const MAX_CLONED_NODES = 100000;
const MAX_CLONED_CHARS = 32 * 1024 * 1024;

export function svgUseResolver(documentNode, length) {
    const targets = new Map();
    for (const element of documentNode.querySelectorAll('[id]')) {
        const id = element.getAttribute('id');
        if (!targets.has(id)) targets.set(id, element);
    }
    const active = new Set();
    let clonedNodes = 0,
        clonedChars = 0;
    const sizes = new WeakMap();
    return (element, visit) => {
        const href = (
            element.hasAttribute('href')
                ? element.getAttribute('href')
                : element.getAttributeNS(XLINK_NS, 'href')
        )?.trim();
        if (!href) return;
        if (!href.startsWith('#'))
            throw new Error(
                'External SVG use references are not supported; embed the referenced artwork.',
            );
        let id;
        try {
            id = decodeURIComponent(href.slice(1));
        } catch {
            throw new Error('Invalid SVG use reference.');
        }
        const target = targets.get(id);
        if (!target) throw new Error(`SVG reference #${id} was not found.`);
        if (active.has(target) || target.contains(element))
            throw new Error('Circular SVG use reference.');
        if (active.size >= 64)
            throw new Error(
                'SVG use references are too deeply nested; unlink the clones.',
            );
        const tag = target.localName;
        if (!TARGETS.has(tag) || target.namespaceURI !== SVG_NS)
            throw new Error(
                `Unsupported SVG use target: ${tag}. Convert it to paths.`,
            );
        let size = sizes.get(target);
        if (!size) {
            const walker = documentNode.createTreeWalker(target);
            let node = target,
                nodes = 0,
                chars = 0;
            do {
                nodes++;
                chars += node.nodeValue?.length ?? 0;
                if (node.nodeType === 1)
                    for (const attribute of node.attributes)
                        chars += attribute.value.length;
                if (
                    clonedNodes + nodes > MAX_CLONED_NODES ||
                    clonedChars + chars > MAX_CLONED_CHARS
                )
                    throw new Error(
                        'SVG use expansion is too large; simplify the artwork.',
                    );
                node = walker.nextNode();
            } while (node);
            size = { nodes, chars };
            sizes.set(target, size);
        }
        clonedNodes += size.nodes;
        clonedChars += size.chars;
        if (clonedNodes > MAX_CLONED_NODES || clonedChars > MAX_CLONED_CHARS)
            throw new Error(
                'SVG use expansion is too large; simplify the artwork.',
            );
        let clone;
        if (tag === 'symbol') {
            clone = documentNode.createElementNS(SVG_NS, 'svg');
            for (const attribute of target.attributes)
                clone.setAttributeNS(
                    attribute.namespaceURI,
                    attribute.name,
                    attribute.value,
                );
            for (const child of target.childNodes)
                clone.appendChild(child.cloneNode(true));
        } else clone = target.cloneNode(true);
        if (tag === 'symbol' || tag === 'svg') {
            for (const [name, axis] of [
                ['width', 'x'],
                ['height', 'y'],
            ]) {
                const value = length(element, name, axis, null);
                if (value !== null && value >= 0)
                    clone.setAttribute(name, String(value));
            }
        }
        active.add(target);
        element.appendChild(clone);
        try {
            visit(clone);
        } finally {
            clone.remove();
            active.delete(target);
        }
    };
}
