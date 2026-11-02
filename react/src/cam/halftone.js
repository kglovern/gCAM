/** Round clustered dots with an area-normalized threshold over a square cell. */
export function createHalftoneScreen(size, angle) {
    const radians = (angle * Math.PI) / 180,
        c = Math.cos(radians) / size,
        s = Math.sin(radians) / size;
    return (tone, x, y) => {
        if (tone <= 0) return 0;
        if (tone >= 1) return 1;
        const u = x * c + y * s,
            v = -x * s + y * c,
            dx = u - Math.floor(u) - 0.5,
            dy = v - Math.floor(v) - 0.5,
            r2 = dx * dx + dy * dy;
        const threshold =
            r2 <= 0.25
                ? Math.PI * r2
                : Math.PI * r2 -
                  4 * r2 * Math.acos(0.5 / Math.sqrt(r2)) +
                  2 * Math.sqrt(r2 - 0.25);
        return tone > threshold ? 1 : 0;
    };
}
