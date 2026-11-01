import type { ViewLoop } from '../canvas/types';
import { assertLayoutSourcesUnchanged } from './arrange-artwork';

export type PatternSettings =
    | {
          kind: 'mirror';
          axis: 'vertical' | 'horizontal';
          position: number;
          keepOriginal: boolean;
      }
    | {
          kind: 'rectangular';
          columns: number;
          rows: number;
          gapX: number;
          gapY: number;
      }
    | {
          kind: 'circular';
          count: number;
          centerX: number;
          centerY: number;
          sweep: number;
          rotateCopies: boolean;
      };

export function patternBounds(shapes: ViewLoop[]) {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        points = 0;
    const ids = new Set<string>();
    for (const shape of shapes) {
        if (
            !shape.id ||
            ids.has(shape.id) ||
            shape.bitmapId ||
            !shape.points?.length
        )
            throw new Error(
                'Select drawing shapes without images or 3D models.',
            );
        ids.add(shape.id);
        for (const p of shape.points) {
            if (
                ++points > 1000000 ||
                ![p.x, p.y].every(Number.isFinite) ||
                Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000
            )
                throw new Error(
                    'Selected shapes exceed supported detail or coordinates.',
                );
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    if (!shapes.length) throw new Error('Select drawing shapes first.');
    return { minX, minY, maxX, maxY, points };
}

export function patternArtwork(shapes: ViewLoop[], settings: PatternSettings) {
    const bounds = patternBounds(shapes);
    const integer = (n: number) => Number.isInteger(n) && n >= 1 && n <= 1000;
    let count: number;
    switch (settings.kind) {
        case 'mirror':
            if (
                !['vertical', 'horizontal'].includes(settings.axis) ||
                !Number.isFinite(settings.position) ||
                typeof settings.keepOriginal !== 'boolean'
            )
                throw new Error('Invalid mirror settings.');
            count = 1;
            break;
        case 'rectangular':
            if (
                !integer(settings.columns) ||
                !integer(settings.rows) ||
                ![settings.gapX, settings.gapY].every(
                    (n) => Number.isFinite(n) && n >= 0,
                )
            )
                throw new Error(
                    'Use positive whole counts and non-negative gaps.',
                );
            count = settings.columns * settings.rows - 1;
            break;
        case 'circular':
            if (
                !integer(settings.count) ||
                ![settings.centerX, settings.centerY, settings.sweep].every(
                    Number.isFinite,
                ) ||
                settings.sweep === 0 ||
                Math.abs(settings.sweep) > 360 ||
                typeof settings.rotateCopies !== 'boolean'
            )
                throw new Error(
                    'Use a whole count and an angle between -360° and 360°.',
                );
            count = settings.count - 1;
            break;
        default:
            throw new Error('Invalid pattern type.');
    }
    if (count < 1) throw new Error('Choose at least two positions.');
    if (
        count > 999 ||
        shapes.length * count > 10000 ||
        bounds.points * count > 1000000
    )
        throw new Error(
            'Too many copies. Reduce the count or simplify the shapes.',
        );
    const instances: ViewLoop[][] = [];
    for (let instance = 1; instance <= count; instance++) {
        let transform: (p: { x: number; y: number }) => {
            x: number;
            y: number;
        };
        if (settings.kind === 'mirror') {
            transform = (p) =>
                settings.axis === 'vertical'
                    ? { x: 2 * settings.position - p.x, y: p.y }
                    : { x: p.x, y: 2 * settings.position - p.y };
        } else if (settings.kind === 'rectangular') {
            const dx =
                    (instance % settings.columns) *
                    (bounds.maxX - bounds.minX + settings.gapX),
                dy =
                    Math.floor(instance / settings.columns) *
                    (bounds.maxY - bounds.minY + settings.gapY);
            transform = (p) => ({ x: p.x + dx, y: p.y + dy });
        } else {
            const step =
                    settings.sweep /
                    (Math.abs(settings.sweep) === 360
                        ? settings.count
                        : settings.count - 1),
                radians = (instance * step * Math.PI) / 180,
                c = Math.cos(radians),
                s = Math.sin(radians),
                cx = (bounds.minX + bounds.maxX) / 2,
                cy = (bounds.minY + bounds.maxY) / 2,
                movedX =
                    settings.centerX +
                    (cx - settings.centerX) * c -
                    (cy - settings.centerY) * s,
                movedY =
                    settings.centerY +
                    (cx - settings.centerX) * s +
                    (cy - settings.centerY) * c;
            transform = settings.rotateCopies
                ? (p) => ({
                      x:
                          settings.centerX +
                          (p.x - settings.centerX) * c -
                          (p.y - settings.centerY) * s,
                      y:
                          settings.centerY +
                          (p.x - settings.centerX) * s +
                          (p.y - settings.centerY) * c,
                  })
                : (p) => ({ x: p.x + movedX - cx, y: p.y + movedY - cy });
        }
        instances.push(
            shapes.map((shape) => {
                const points = shape.points.map((p) => ({
                    ...p,
                    ...transform(p),
                }));
                if (
                    points.some(
                        (p) =>
                            ![p.x, p.y].every(Number.isFinite) ||
                            Math.max(Math.abs(p.x), Math.abs(p.y)) > 1000000,
                    )
                )
                    throw new Error(
                        'Pattern exceeds supported coordinate limits.',
                    );
                const geometry = shape.exportGeometry as
                    | { type?: string; cx?: number; cy?: number }
                    | undefined;
                const center =
                    geometry?.type === 'circle' &&
                    Number.isFinite(geometry.cx) &&
                    Number.isFinite(geometry.cy)
                        ? transform({ x: geometry.cx!, y: geometry.cy! })
                        : null;
                return {
                    ...shape,
                    points,
                    bounds: undefined,
                    segments: undefined,
                    path2d: null,
                    exportGeometry: center
                        ? {
                              ...geometry,
                              cx: center.x,
                              cy: center.y,
                          }
                        : undefined,
                };
            }),
        );
    }
    return {
        instances,
        replace: settings.kind === 'mirror' && !settings.keepOriginal,
    };
}
export type PatternResult = ReturnType<typeof patternArtwork>;

export function applyArtworkPattern(
    loops: ViewLoop[],
    source: ViewLoop[],
    result: PatternResult,
    newId: () => string,
) {
    assertLayoutSourcesUnchanged(loops, [], {
        shapes: source,
        bitmaps: [],
        order: [],
    });
    const replacements = new Map(
        result.replace ? result.instances[0].map((s) => [s.id, s]) : [],
    );
    const added = result.replace
        ? []
        : result.instances.flatMap((instance) => {
              const groups = new Map<string, string>();
              return instance.map((shape) => {
                  if (shape.groupId && !groups.has(shape.groupId))
                      groups.set(shape.groupId, newId());
                  return {
                      ...shape,
                      id: newId(),
                      groupId: shape.groupId
                          ? groups.get(shape.groupId)
                          : undefined,
                  };
              });
          });
    return {
        loops: [...loops.map((s) => replacements.get(s.id) ?? s), ...added],
        selected: result.replace
            ? source.map((s) => s.id)
            : added.map((s) => s.id),
        changedSources: result.replace ? source : [],
    };
}
