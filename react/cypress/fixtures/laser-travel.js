export function travelFixture(count, seed = 1) {
    let state = seed;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const columns = Math.ceil(Math.sqrt(count));
    const paths = Array.from({ length: count }, (_, n) => {
        const x = (n % columns) * 30 + 5 + random() * 7,
            y = Math.floor(n / columns) * 30 + 5 + random() * 7;
        return {
            id: String(n),
            points: [
                { x, y },
                { x: x + 3, y },
                { x: x + 3, y: y + 3 },
                { x, y: y + 3 },
                { x, y },
            ],
        };
    });
    for (let index = count - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [paths[index], paths[other]] = [paths[other], paths[index]];
    }
    return paths;
}
