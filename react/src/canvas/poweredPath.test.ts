import { strokePoweredPath } from './poweredPath';

test('row previews preserve power at the move end and leave S0 gaps and overscan invisible', () => {
    const moves: unknown[] = [];
    const ctx = {
        globalAlpha: 1,
        beginPath() {
            moves.push('begin');
        },
        moveTo(x: number, y: number) {
            moves.push(['from', x, y]);
        },
        lineTo(x: number, y: number) {
            moves.push(['to', x, y]);
        },
        stroke() {
            moves.push(['power', this.globalAlpha]);
        },
    };
    const points = [
        { x: -10, y: 0, power: 0 },
        { x: 0, y: 0, power: 0 },
        { x: 10, y: 0, power: 250 },
        { x: 20, y: 0, power: 750 },
        { x: 30, y: 0, power: 0 },
        { x: 40, y: 0, power: 1000 },
        { x: 50, y: 0, power: 0 },
    ];
    strokePoweredPath(
        ctx as unknown as CanvasRenderingContext2D,
        points,
        (x, y) => ({ x, y }),
    );
    expect(moves).toEqual([
        'begin',
        ['from', 0, 0],
        ['to', 10, 0],
        ['power', 0.25],
        'begin',
        ['from', 10, 0],
        ['to', 20, 0],
        ['power', 0.75],
        'begin',
        ['from', 30, 0],
        ['to', 40, 0],
        ['power', 1],
    ]);
    moves.length = 0;
    strokePoweredPath(
        ctx as unknown as CanvasRenderingContext2D,
        points,
        (x, y) => ({ x: x * 2, y: y + 1 }),
        500,
    );
    expect(moves.filter((p) => Array.isArray(p) && p[0] === 'power')).toEqual([
        ['power', 0.5],
        ['power', 1],
        ['power', 1],
    ]);
    expect(moves[1]).toEqual(['from', 0, 1]);
    expect(moves[2]).toEqual(['to', 20, 1]);
});
