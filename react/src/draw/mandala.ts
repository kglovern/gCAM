export type MandalaOptions = {
    diameter: number;
    petals: number;
    rings: number;
};
export function mandalaLoops({ diameter, petals, rings }: MandalaOptions) {
    if (
        !Number.isFinite(diameter) ||
        diameter < 5 ||
        diameter > 2000 ||
        !Number.isInteger(petals) ||
        petals < 4 ||
        petals > 32 ||
        !Number.isInteger(rings) ||
        rings < 1 ||
        rings > 6
    )
        throw new Error('Use diameter 5–2000 mm, 4–32 petals and 1–6 rings.');
    const radius = diameter / 2;
    const circle = (r: number) => ({
        points: Array.from({ length: 129 }, (_, i) => {
            const a = ((i % 128) * Math.PI * 2) / 128;
            return { x: r * Math.cos(a), y: r * Math.sin(a) };
        }),
    });
    const loops = [circle(radius * 0.1), circle(radius)];
    for (let ring = 0; ring < rings; ring++) {
        const inner = radius * (0.16 + (0.78 * ring) / rings),
            outer = radius * (0.16 + (0.78 * (ring + 0.9)) / rings);
        for (let petal = 0; petal < petals; petal++) {
            const angle = ((petal + (ring % 2) / 2) * Math.PI * 2) / petals;
            loops.push({
                points: Array.from({ length: 65 }, (_, i) => {
                    const t = ((i % 64) * Math.PI * 2) / 64;
                    const r =
                        (inner + outer) / 2 -
                        ((outer - inner) / 2) * Math.cos(t);
                    const a =
                        angle + ((0.42 * Math.PI * 2) / petals) * Math.sin(t);
                    return { x: r * Math.cos(a), y: r * Math.sin(a) };
                }),
            });
        }
    }
    return loops;
}
