/**
 * Purpose: Vortex A-axis GRBL post — matches the Sienci VCarve rotary post
 * (T1/G17/G21/G90 header, S+M3, M5/M2 footer, Z-zero at cylinder axis).
 */
import type { RotaryStock, RotaryTool, ToolpathMove } from './types';

const f3 = (n: number): string => (Math.round(n * 1000) / 1000).toFixed(3);

export interface GcodeContext {
    stock: RotaryStock;
    tool: RotaryTool;
    name: string;
    mode: 'profile' | 'stl';
    compR: number;
    toolChange?: boolean;
}

export function toGcode(moves: ToolpathMove[], ctx: GcodeContext): string {
    const { stock, tool, name, mode, compR } = ctx;
    const xyza = moves.some((m) => m.y !== undefined);
    if (
        xyza &&
        moves.some(
            (m) =>
                [m.x, m.y, m.z, m.a].some(
                    (v) => v !== undefined && !Number.isFinite(v),
                ) ||
                (!m.rapid &&
                    (!(m.minutes! > 0) || !Number.isFinite(m.minutes))),
        )
    )
        throw new Error(
            'Invalid XYZA block coordinates or inverse-time duration.',
        );
    const stockR = stock.diameter / 2;
    const zSafe = stockR + 5;
    const zPark = stockR + 20;
    const L: string[] = [];
    const commentName = (name || 'untitled').replace(/[()\r\n]/g, ' ');
    L.push(`(gCAM rotary - ${commentName})`);
    L.push(
        `(Mode ${mode === 'stl' ? 'STL mesh XYZA (tip coordinates)' : 'Profile conversational (envelope, no comp)'})`,
    );
    if (mode === 'stl')
        L.push(
            '(Mesh cutter envelope; independent Y and A axes required. Use 4th Axis Mode, not Y-to-A substitution.)',
        );
    L.push(`(Stock L${stock.length} D${stock.diameter} grip${stock.grip})`);
    L.push(
        `(Tool ${tool.type} D${tool.dia} S${tool.spindle} F${tool.feed}/${tool.plunge})`,
    );
    L.push(
        xyza
            ? '(Z/Y zero = cylinder axis, X-zero = chuck side. Independent XYZA axes.)'
            : '(Z-zero = cylinder axis, X-zero = chuck side. Enable Rotary mode in gSender.)',
    );
    L.push(`T${tool.slotNum ?? 1}`);
    L.push('G17');
    L.push('G21');
    L.push('G90');
    if (xyza) L.push('G94');
    L.push(`G0Z${f3(zPark)}`);
    if (ctx.toolChange) L.push(`(Change to T${tool.slotNum ?? 1})`, 'M6');
    if (!xyza) L.push('G0X0.000A0.000');
    L.push(`S${tool.spindle}M3`);
    let lastOp = '';
    let aMin = Infinity;
    let aMax = -Infinity;
    for (const m of moves) {
        if (m.op !== lastOp) {
            L.push(`(${m.op})`);
            lastOp = m.op;
        }
        // Any axis may be omitted (modal) — never synthesize one.
        if (xyza && !m.rapid) L.push('G93');
        let w = m.rapid ? 'G0' : 'G1';
        if (m.x !== undefined) {
            w += `X${f3(m.x)}`;
        }
        if (m.y !== undefined) w += `Y${f3(m.y)}`;
        if (m.a !== undefined) {
            w += `A${f3(m.a)}`;
            if (m.a < aMin) {
                aMin = m.a;
            }
            if (m.a > aMax) {
                aMax = m.a;
            }
        }
        if (m.z !== undefined) {
            w += `Z${f3(m.z)}`;
        }
        if (!m.rapid) {
            if (xyza) {
                // Round down so formatting cannot shorten the requested block time.
                const inverse = Math.floor((1 / m.minutes!) * 1e6) / 1e6;
                if (!(inverse > 0))
                    throw new Error(
                        'XYZA block duration exceeds supported inverse-time precision.',
                    );
                w += `F${inverse.toFixed(6)}`;
            } else if (m.f) w += `F${m.f.toFixed(1)}`;
        }
        L.push(w);
    }
    if (aMax > -Infinity) {
        L.push(
            `(A range ${aMin.toFixed(1)}..${aMax.toFixed(1)} deg)`,
        );
    }
    if (xyza) L.push('G94');
    L.push(`G0Z${f3(zSafe)}`);
    L.push('M5');
    L.push(`G0Z${f3(zPark)}`);
    if (!xyza) L.push('G0X0.000A0.000');
    L.push('M2');
    return `${L.join('\r\n')}\r\n`;
}
