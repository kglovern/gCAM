type Point = { x: number; y: number; power?: number };

/** Power belongs to the move ending at each point; S0 travel is invisible. */
export function strokePoweredPath(
    ctx: CanvasRenderingContext2D,
    points: readonly Point[],
    toScreen: (x: number, y: number) => { x: number; y: number },
    maximum = 1000,
) {
    for (let i = 1; i < points.length; i++) {
        const power = points[i].power;
        if (!Number.isFinite(power) || !power || power < 0) continue;
        ctx.globalAlpha = Math.min(1, power / Math.max(1, maximum));
        const a = toScreen(points[i - 1].x, points[i - 1].y),
            b = toScreen(points[i].x, points[i].y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
}
