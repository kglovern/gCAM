/** Infinite construction guides and their source-line geometry. */
export interface GuidePoint {
    x: number;
    y: number;
}

export interface Guide {
    id: string;
    point: GuidePoint;
    direction: GuidePoint;
}

export interface GuideSource {
    point: GuidePoint;
    direction: GuidePoint;
    label: string;
    distance: number;
}

export interface GuideDraft {
    cursor?: GuidePoint;
    source: GuidePoint;
    direction: GuidePoint;
    sourceLabel: string;
    offset: number;
}

export interface GuidePlacement {
    point: GuidePoint;
    direction: GuidePoint;
}

function hasGuideGeometry(
    guide: Guide,
): guide is Guide & { point: GuidePoint; direction: GuidePoint } {
    return Boolean(
        guide?.point &&
            guide?.direction &&
            Number.isFinite(guide.point.x) &&
            Number.isFinite(guide.point.y) &&
            Number.isFinite(guide.direction.x) &&
            Number.isFinite(guide.direction.y),
    );
}

/** Find the nearest vector edge or world axis under the pointer. */
export function findGuideSource(
    world: GuidePoint,
    loops: { id: string; points: GuidePoint[] }[],
    hidden: string[],
    scale: number,
    hitRadiusPx = 12,
): GuideSource | null {
    const candidates: GuideSource[] = [];
    const add = (point: GuidePoint, direction: GuidePoint, label: string) => {
        const length = Math.hypot(direction.x, direction.y);
        if (length < 1e-9) return;
        const distance =
            Math.hypot(point.x - world.x, point.y - world.y) * scale;
        if (distance <= hitRadiusPx) {
            candidates.push({
                point,
                direction: { x: direction.x / length, y: direction.y / length },
                label,
                distance,
            });
        }
    };

    add({ x: world.x, y: 0 }, { x: 1, y: 0 }, 'X Axis');
    add({ x: 0, y: world.y }, { x: 0, y: 1 }, 'Y Axis');

    for (const loop of loops) {
        if (hidden.includes(loop.id)) continue;
        for (let index = 0; index < loop.points.length - 1; index += 1) {
            const start = loop.points[index];
            const end = loop.points[index + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            if (lengthSquared < 1e-12) continue;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((world.x - start.x) * dx + (world.y - start.y) * dy) /
                        lengthSquared,
                ),
            );
            add(
                { x: start.x + dx * t, y: start.y + dy * t },
                { x: dx, y: dy },
                'Edge',
            );
        }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] ?? null;
}

/** Return the nearest point on an infinite guide line. */
export function projectToGuide(point: GuidePoint, guide: Guide): GuidePoint {
    if (!hasGuideGeometry(guide)) return point;
    const length = Math.hypot(guide.direction.x, guide.direction.y) || 1;
    const dx = guide.direction.x / length;
    const dy = guide.direction.y / length;
    const along =
        (point.x - guide.point.x) * dx + (point.y - guide.point.y) * dy;
    return { x: guide.point.x + dx * along, y: guide.point.y + dy * along };
}

/** Find the nearest intersection between two non-parallel infinite guides. */
export function findGuideIntersection(
    point: GuidePoint,
    guides: Guide[],
    scale: number,
    hitRadiusPx = 12,
): { point: GuidePoint; distancePx: number } | null {
    const safeScale = Math.max(scale, 0.01);
    let nearest: { point: GuidePoint; distancePx: number } | null = null;
    for (let firstIndex = 0; firstIndex < guides.length; firstIndex += 1) {
        const first = guides[firstIndex];
        if (!hasGuideGeometry(first)) continue;
        for (
            let secondIndex = firstIndex + 1;
            secondIndex < guides.length;
            secondIndex += 1
        ) {
            const second = guides[secondIndex];
            if (!hasGuideGeometry(second)) continue;
            const denominator =
                first.direction.x * second.direction.y -
                first.direction.y * second.direction.x;
            if (Math.abs(denominator) < 1e-9) continue;
            const betweenX = second.point.x - first.point.x;
            const betweenY = second.point.y - first.point.y;
            const alongFirst =
                (betweenX * second.direction.y -
                    betweenY * second.direction.x) /
                denominator;
            const intersection = {
                x: first.point.x + alongFirst * first.direction.x,
                y: first.point.y + alongFirst * first.direction.y,
            };
            const distancePx =
                Math.hypot(intersection.x - point.x, intersection.y - point.y) *
                safeScale;
            if (
                distancePx <= hitRadiusPx &&
                (!nearest || distancePx < nearest.distancePx)
            ) {
                nearest = { point: intersection, distancePx };
            }
        }
    }
    return nearest;
}

/** Find the nearest placed guide under a pointer using a screen-space hit target. */
export function findGuideAtPoint(
    point: GuidePoint,
    guides: Guide[],
    scale: number,
    hitRadiusPx = 10,
): Guide | null {
    const safeScale = Math.max(scale, 0.01);
    let nearest: Guide | null = null;
    let bestDistance = hitRadiusPx;
    for (const guide of guides) {
        if (!hasGuideGeometry(guide)) continue;
        const projected = projectToGuide(point, guide);
        const distance =
            Math.hypot(projected.x - point.x, projected.y - point.y) *
            safeScale;
        if (distance <= bestDistance) {
            nearest = guide;
            bestDistance = distance;
        }
    }
    return nearest;
}

/** Snap to the closest guide within tolerance (millimetres). */
export function snapToGuides(
    point: GuidePoint,
    guides: Guide[],
    tolerance = 1,
): GuidePoint {
    let nearest = point;
    let bestDistance = tolerance;
    for (const guide of guides) {
        if (!hasGuideGeometry(guide)) continue;
        const projected = projectToGuide(point, guide);
        const distance = Math.hypot(
            projected.x - point.x,
            projected.y - point.y,
        );
        if (distance < bestDistance) {
            nearest = projected;
            bestDistance = distance;
        }
    }
    return nearest;
}
