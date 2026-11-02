import type { ViewLoop } from '../canvas/types';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';

function artworkMatcher(shapes: ViewLoop[]) {
    const ids = new Set(shapes.map((s) => s.id));
    let legacy: Set<string> | null = null;
    return (source: { id?: string; points: ViewLoop['points'] }) => {
        if (source.id) return ids.has(source.id);
        if (!legacy)
            legacy = new Set(shapes.map((s) => JSON.stringify(s.points)));
        return legacy.has(JSON.stringify(source.points));
    };
}
export function operationTouchesShapes(
    entry: ToolpathStackEntry,
    shapes: ViewLoop[],
) {
    const matches = artworkMatcher(shapes);
    return (
        entry.args.loops.some(matches) ||
        (entry.args.laserOptions?.maskSourceIds ?? []).some((id) =>
            shapes.some((s) => s.id === id),
        )
    );
}
export function operationsTouchingShapes(
    stack: ToolpathStackEntry[],
    shapes: ViewLoop[],
) {
    const matches = artworkMatcher(shapes);
    const ids = new Set(shapes.map((s) => s.id));
    return stack.filter(
        (entry) =>
            entry.args.loops.some(matches) ||
            (entry.args.laserOptions?.maskSourceIds ?? []).some((id) =>
                ids.has(id),
            ),
    );
}
export function assertArtworkSourcesUnchanged(
    current: ViewLoop[],
    source: ViewLoop[],
) {
    const byId = new Map(current.map((s) => [s.id, s]));
    if (
        source.some((s) => JSON.stringify(byId.get(s.id)) !== JSON.stringify(s))
    )
        throw new Error('Source shapes changed. Close and reopen this tool.');
}

export function laserFillShapeIds(
    stack: ToolpathStackEntry[],
    shapes: ViewLoop[],
) {
    const ids = new Set<string>(),
        legacy = new Set<string>();
    for (const entry of stack) {
        if (
            entry.outputEnabled === false ||
            entry.args.operation !== 'laser-fill'
        )
            continue;
        for (const loop of entry.args.loops) {
            if (loop.id) ids.add(loop.id);
            else legacy.add(JSON.stringify(loop.points));
        }
    }
    return shapes
        .filter(
            (shape) =>
                ids.has(shape.id) ||
                (legacy.size > 0 && legacy.has(JSON.stringify(shape.points))),
        )
        .map((shape) => shape.id);
}
