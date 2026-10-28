import type {
    RotaryStock,
    RotarySupports,
    RotaryTool,
    ToolpathMove,
} from './types';
import { blockMinutes } from './meshToolpath';

export const defaultSupports: RotarySupports = {
    enabled: true,
    coreDiameter: 6,
    endDiameter: 10,
    chuckOverlap: 5,
    tailOverlap: 5,
};

export type SupportZone = { x0: number; x1: number; radius: number };

export function supportZones(
    stock: RotaryStock,
    minX: number,
    maxX: number,
): SupportZone[] {
    const s = stock.supports;
    if (!s?.enabled) return [];
    if (
        typeof s.enabled !== 'boolean' ||
        ![
            s.coreDiameter,
            s.endDiameter,
            s.chuckOverlap,
            s.tailOverlap,
            minX,
            maxX,
            stock.length,
            stock.diameter,
        ].every(Number.isFinite) ||
        s.coreDiameter <= 0 ||
        s.endDiameter < s.coreDiameter ||
        s.endDiameter > stock.diameter ||
        s.chuckOverlap < 0 ||
        s.tailOverlap < 0 ||
        minX < 0 ||
        maxX > stock.length ||
        maxX <= minX ||
        s.chuckOverlap + s.tailOverlap >= maxX - minX
    )
        throw new Error(
            'Use positive support diameters within the blank, and end overlaps shorter than the part. The part must fit inside the stock.',
        );
    return [
        { x0: 0, x1: stock.length, radius: s.coreDiameter / 2 },
        { x0: 0, x1: minX + s.chuckOverlap, radius: s.endDiameter / 2 },
        {
            x0: maxX - s.tailOverlap,
            x1: stock.length,
            radius: s.endDiameter / 2,
        },
    ];
}

/** Upper contact envelope of finite axial cylinders, including their end faces. */
export function supportContact(
    zones: SupportZone[],
    x: number,
    y: number,
    cutterRadius: number,
    ball: boolean,
    tipRadius = cutterRadius,
) {
    let height = -Infinity;
    for (const zone of zones) {
        const dx = Math.max(zone.x0 - x, 0, x - zone.x1);
        if (dx > cutterRadius) continue;
        const reach = Math.sqrt(Math.max(0, cutterRadius ** 2 - dx ** 2));
        if (ball) {
            const squared = (zone.radius + reach) ** 2 - y ** 2;
            if (squared >= 0)
                height = Math.max(height, Math.sqrt(squared) - tipRadius);
        } else {
            const dy = Math.max(0, Math.abs(y) - reach);
            if (dy <= zone.radius)
                height = Math.max(
                    height,
                    Math.sqrt(Math.max(0, zone.radius ** 2 - dy ** 2)),
                );
        }
    }
    return height;
}

/** Inflate the cutter over each complete XY segment; A cannot change an axial cylinder. */
export function protectSupports(
    moves: ToolpathMove[],
    zones: SupportZone[],
    tool: RotaryTool,
    assembly?: {
        shankDiameter: number;
        holderDiameter: number;
        rotaryRate?: number;
    },
) {
    if (!zones.length || !moves.length) return moves;
    if (
        !['flat', 'ball'].includes(tool.type) ||
        !Number.isFinite(tool.dia) ||
        tool.dia <= 0 ||
        [assembly?.shankDiameter ?? 0, assembly?.holderDiameter ?? 0].some(
            (diameter) => !Number.isFinite(diameter) || diameter < 0,
        )
    )
        throw new Error(
            'Stock supports require a flat or straight ball endmill and valid tool assembly diameters.',
        );
    const result = moves.map((move) => ({ ...move }));
    const radius = tool.dia / 2;
    const reach = Math.max(
        radius,
        (assembly?.shankDiameter ?? 0) / 2,
        (assembly?.holderDiameter ?? 0) / 2,
    );
    const ball = tool.type === 'ball' && reach === radius;
    let previous = { x: 0, y: 0, z: Infinity };
    for (let i = 0; i < result.length; i++) {
        const move = result[i];
        const point = {
            x: move.x ?? previous.x,
            y: move.y ?? previous.y,
            z: move.z ?? previous.z,
        };
        const guard =
            Math.hypot(point.x - previous.x, point.y - previous.y) / 2 + 0.001;
        const floor =
            supportContact(
                zones,
                (point.x + previous.x) / 2,
                (point.y + previous.y) / 2,
                reach + guard,
                ball,
                radius,
            ) + 0.001;
        if (Number.isFinite(floor)) {
            point.z = Math.max(point.z, floor);
            move.z = point.z;
            if (i > 0) result[i - 1].z = Math.max(previous.z, floor);
        }
        previous = point;
    }
    let from = { x: 0, y: 0, z: 0, a: 0 };
    for (const move of result) {
        const to = {
            x: move.x ?? from.x,
            y: move.y ?? from.y,
            z: move.z ?? from.z,
            a: move.a ?? from.a,
        };
        if (!move.rapid && move.minutes !== undefined)
            move.minutes = Math.max(
                move.minutes,
                Math.max(0, from.z - to.z) / tool.plunge,
                blockMinutes(
                    from,
                    to,
                    move.f ?? tool.feed,
                    assembly?.rotaryRate ?? Infinity,
                ),
            );
        from = to;
    }
    return result;
}
