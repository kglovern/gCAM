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
    const stockR = stock.diameter / 2;
    const zSafe = stockR + 5;
    const zPark = stockR + 20;
    const L: string[] = [];
    L.push(`(VortexCAM 1.0 - ${name || 'untitled'})`);
    L.push(
        `(Mode ${mode === 'stl' ? 'STL rotary (surface + tooltip comp)' : 'Profile conversational (envelope, no comp)'})`,
    );
    if (mode === 'stl') {
        L.push(
            `(Ballnose tooltip comp R${compR.toFixed(3)}: tip exact on flats, tangent on slopes)`,
        );
    }
    L.push(`(Stock L${stock.length} D${stock.diameter} grip${stock.grip})`);
    L.push(
        `(Tool ${tool.type} D${tool.dia} S${tool.spindle} F${tool.feed}/${tool.plunge})`,
    );
    L.push(
        '(Z-zero = cylinder axis, X-zero = chuck side. Enable Rotary mode in gSender.)',
    );
    L.push(`T${tool.slotNum ?? 1}`);
    L.push('G17');
    L.push('G21');
    L.push('G90');
    L.push(`G0Z${f3(zPark)}`);
    if (ctx.toolChange) L.push(`(Change to T${tool.slotNum ?? 1})`, 'M6');
    L.push('G0X0.000A0.000');
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
        let w = m.rapid ? 'G0' : 'G1';
        if (m.x !== undefined) {
            w += `X${f3(m.x)}`;
        }
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
        if (!m.rapid && m.f) {
            w += `F${m.f.toFixed(1)}`;
        }
        L.push(w);
    }
    if (aMax > -Infinity) {
        L.push(
            `(A range ${aMin.toFixed(1)}..${aMax.toFixed(1)} deg — oscillates, never winds up)`,
        );
    }
    L.push(`G0Z${f3(zSafe)}`);
    L.push('M5');
    L.push(`G0Z${f3(zPark)}`);
    L.push('G0X0.000A0.000');
    L.push('M2');
    return `${L.join('\r\n')}\r\n`;
}
