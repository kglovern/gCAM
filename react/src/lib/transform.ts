/**
 * Purpose: Implementation module for transform in the lib domain.
 */
export interface TPoint {
    x: number;
    y: number;
}

export type TransformMode = 'move' | 'scale' | 'rotate' | 'transform';

export type TransformCommit =
    | { type: 'move'; dx: number; dy: number }
    | { type: 'rotate'; degrees: number; about: TPoint }
    | { type: 'scale'; factor: number; about: TPoint };

export function translatePoints(
    points: TPoint[],
    dx: number,
    dy: number,
): TPoint[] {
    return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function centroid(points: TPoint[]): TPoint {
    // Ignore a duplicated closure point so closed loops center correctly.
    let list = points;
    if (
        points.length > 1 &&
        points[0].x === points[points.length - 1].x &&
        points[0].y === points[points.length - 1].y
    ) {
        list = points.slice(0, -1);
    }
    let sx = 0;
    let sy = 0;
    for (const p of list) {
        sx += p.x;
        sy += p.y;
    }
    return {
        x: sx / Math.max(1, list.length),
        y: sy / Math.max(1, list.length),
    };
}

export function rotatePoints(
    points: TPoint[],
    degrees: number,
    about?: TPoint,
): TPoint[] {
    const c = about ?? centroid(points);
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return points.map((p) => {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        return {
            x: c.x + dx * cos - dy * sin,
            y: c.y + dx * sin + dy * cos,
        };
    });
}

export function scalePoints(
    points: TPoint[],
    factor: number,
    about?: TPoint,
): TPoint[] {
    if (!(factor > 0)) throw new Error('Scale factor must be positive.');
    const c = about ?? centroid(points);
    return points.map((p) => ({
        x: c.x + (p.x - c.x) * factor,
        y: c.y + (p.y - c.y) * factor,
    }));
}

/** Non-uniform scale for absolute Width × Height applies. */
export function scalePointsXY(
    points: TPoint[],
    fx: number,
    fy: number,
    about?: TPoint,
): TPoint[] {
    if (!(fx > 0) || !(fy > 0))
        throw new Error('Scale factors must be positive.');
    const c = about ?? centroid(points);
    return points.map((p) => ({
        x: c.x + (p.x - c.x) * fx,
        y: c.y + (p.y - c.y) * fy,
    }));
}
