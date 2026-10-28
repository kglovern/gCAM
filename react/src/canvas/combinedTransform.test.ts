import { beginTransformDrag } from './transformInteraction';
const loops = [
    {
        id: 'square',
        points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
            { x: 10, y: 30 },
        ],
    },
];
const camera = { tx: 0, ty: 400, scale: 10 };
const begin = (x: number, y: number) =>
    beginTransformDrag({
        mode: 'transform',
        loops,
        selected: ['square'],
        hidden: [],
        camera,
        screen: { x, y },
    });
test('combined frame dispatches move, resize and rotation separately', () => {
    expect(begin(200, 200)?.drag.mode).toBe('move');
    const resize = begin(300, 100);
    expect(resize?.drag.mode).toBe('scale');
    expect(resize?.drag.anchor).toEqual({ x: 10, y: 10 });
    const o = 18 / Math.sqrt(2);
    expect(begin(300 + o, 100 - o)?.drag.mode).toBe('rotate');
    expect(begin(500, 500)).toBeNull();
});
test('hidden selections cannot be transformed', () => {
    expect(
        beginTransformDrag({
            mode: 'transform',
            loops,
            selected: ['square'],
            hidden: ['square'],
            camera,
            screen: { x: 200, y: 200 },
        }),
    ).toBeNull();
});
