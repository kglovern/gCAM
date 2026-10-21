/** Drawing layers organise geometry independently of machining operations. */
export interface DrawingLayer {
    id: string;
    name: string;
    color?: string;
}
export const DEFAULT_LAYER_ID = 'default';
export const DEFAULT_LAYER: DrawingLayer = {
    id: DEFAULT_LAYER_ID,
    name: 'Default',
};
export interface LayeredObject {
    layerId?: string;
}
export function objectLayerId(object: LayeredObject): string {
    return object.layerId || DEFAULT_LAYER_ID;
}
/** Repair legacy documents and dangling references without losing geometry. */
export function normalizeLayers(
    value: unknown,
    objects: LayeredObject[],
): DrawingLayer[] {
    const layers = new Map<string, DrawingLayer>([
        [DEFAULT_LAYER_ID, { ...DEFAULT_LAYER }],
    ]);
    if (Array.isArray(value))
        for (const entry of value) {
            if (
                !entry ||
                typeof entry.id !== 'string' ||
                !entry.id ||
                typeof entry.name !== 'string' ||
                !entry.name.trim()
            )
                continue;
            layers.set(entry.id, {
                id: entry.id,
                name: entry.name.trim(),
                ...(typeof entry.color === 'string' &&
                /^#[0-9a-f]{6}$/i.test(entry.color)
                    ? { color: entry.color }
                    : {}),
            });
        }
    for (const object of objects) {
        const id = objectLayerId(object);
        if (!layers.has(id)) layers.set(id, { id, name: id });
    }
    return [...layers.values()];
}

/** A layer layout is useful project content even before any shapes are drawn. */
export function hasLayerContent(layers?: DrawingLayer[]): boolean {
    return (
        layers?.some(
            (layer) =>
                layer.id !== DEFAULT_LAYER_ID ||
                layer.name !== DEFAULT_LAYER.name ||
                Boolean(layer.color),
        ) ?? false
    );
}

/** The sidebar lists occupied layers; empty definitions remain available for assignment and drawing. */
export function layersInUse(
    layers: DrawingLayer[],
    objects: LayeredObject[],
): DrawingLayer[] {
    const used = new Set(objects.map(objectLayerId));
    return layers.filter((layer) => used.has(layer.id));
}
