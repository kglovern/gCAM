export function hatchIslands(count = 10, height = 8, width = 3, gap = 1) {
    return Array.from({ length: count }, (_, index) => {
        const x = 10 + index * (width + gap),
            y = 10;
        return {
            id: `island-${index}`,
            points: [
                { x, y },
                { x: x + width, y },
                { x: x + width, y: y + height },
                { x, y: y + height },
                { x, y },
            ],
        };
    });
}
