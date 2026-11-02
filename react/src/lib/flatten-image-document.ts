import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { ViewLoop } from '../canvas/types';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import type { FlattenImageResult } from './flatten-image';
import {
    assertArtworkSourcesUnchanged,
    operationsTouchingShapes,
} from './vector-bitmap-document';
export interface FlattenImageCommit {
    source: PlacedBitmapRecord;
    shapes: ViewLoop[];
    maskSources?: ViewLoop[];
    result: FlattenImageResult;
    dataUrl: string;
    img: HTMLImageElement;
}
export function flattenedImageDocument(
    current: {
        loops: ViewLoop[];
        bitmaps: PlacedBitmapRecord[];
        stack: ToolpathStackEntry[];
    },
    commit: FlattenImageCommit,
    id: string,
) {
    const source = current.bitmaps.find((b) => b.id === commit.source.id);
    const record = (b: PlacedBitmapRecord) => {
        const { img, ...saved } = b;
        return saved;
    };
    if (
        !source ||
        JSON.stringify(record(source)) !== JSON.stringify(record(commit.source))
    )
        throw new Error('Source image changed. Close and reopen flattening.');
    if (
        !commit.shapes.length ||
        commit.shapes.some((s) => s.bitmapId !== source.id) ||
        current.bitmaps.some((b) => b.id === id)
    )
        throw new Error('Invalid flattened image replacement.');
    assertArtworkSourcesUnchanged(current.loops, commit.shapes);
    if (
        source.maskSourceIds?.length &&
        (commit.maskSources?.length !== source.maskSourceIds.length ||
            source.maskSourceIds.some(
                (id) => !commit.maskSources?.some((s) => s.id === id),
            ))
    )
        throw new Error(
            'Linked mask sources changed. Close and reopen flattening.',
        );
    assertArtworkSourcesUnchanged(current.loops, commit.maskSources ?? []);
    const affected = new Set(
        operationsTouchingShapes(current.stack, commit.shapes),
    );
    const bitmap: PlacedBitmapRecord = {
        id,
        ...commit.result.placement,
        dataUrl: commit.dataUrl,
        img: commit.img,
    };
    return {
        loops: current.loops.map((l) =>
            l.bitmapId === source.id
                ? {
                      ...l,
                      bitmapId: id,
                      points: commit.result.points.map((p) => ({ ...p })),
                  }
                : l,
        ),
        bitmaps: current.bitmaps.map((b) => (b.id === source.id ? bitmap : b)),
        stack: current.stack.filter((e) => !affected.has(e)),
        selected: commit.shapes.map((s) => s.id),
        removed: affected.size,
    };
}
