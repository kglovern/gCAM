/** Fit the stock and chuck using the limiting viewport dimension. */
export function rotaryViewFit(
    length: number,
    diameter: number,
    aspect: number,
) {
    const halfLength = (length + 40) / 2;
    const radius = Math.max(diameter / 2, 25);
    const tangent = Math.tan((20 * Math.PI) / 180);
    const distance =
        (Math.max(
            halfLength / (tangent * Math.max(0.1, aspect)),
            radius / tangent,
        ) +
            radius) *
        1.15;
    return { centerX: length / 2, distance };
}
