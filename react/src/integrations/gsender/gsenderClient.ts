/**
 * Purpose: Client for gSender's loopback "gCAM handoff" listener (protocol v1).
 *
 * gSender listens on 127.0.0.1 only and checks the page Origin, so this works
 * from the hosted web build and from a local dev server alike. Browsers treat
 * loopback as potentially trustworthy, so an https page may call it (Chrome
 * may show a one-time local network access prompt).
 *
 * The desktop app's renderer runs on gcam://app, so it goes through the
 * main-process bridge (packaging/desktop/gsender.cjs) instead of fetch.
 */

const DEFAULT_TIMEOUT_MS = 4000;
// Large programs can take a moment to serialise and write on the gSender side.
const SEND_TIMEOUT_MS = 30000;

export type GsenderStatus =
    | { state: 'ready'; version: string }
    | { state: 'busy'; version: string }
    | { state: 'disabled'; version: string }
    | { state: 'unreachable' };

export type GsenderSendResult =
    | { ok: true; name: string }
    | {
          ok: false;
          reason:
              | 'unreachable'
              | 'busy'
              | 'disabled'
              | 'refused'
              | 'too-large'
              | 'failed';
          message: string;
      };

/** Raw listener reply; status 0 means gSender could not be reached. */
export type GsenderReply = { status: number; body: unknown };

export interface GsenderBridge {
    ping(port: number): Promise<GsenderReply>;
    send(request: {
        port: number;
        name: string;
        gcode: string;
    }): Promise<GsenderReply>;
}

type GsenderWindow = Window & { gcamGsender?: GsenderBridge };

function gsenderBridge(): GsenderBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as GsenderWindow).gcamGsender ?? null;
}

interface ClientOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** Defaults to the desktop bridge when present, else fetch is used. */
    bridge?: GsenderBridge | null;
}

function baseUrl(port: number) {
    return `http://127.0.0.1:${port}/gcam/v1`;
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: ClientOptions,
): Promise<GsenderReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            ...init,
            signal: controller.signal,
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    } catch {
        return { status: 0, body: null };
    } finally {
        clearTimeout(timer);
    }
}

export async function pingGsender(
    port: number,
    options: ClientOptions = {},
): Promise<GsenderStatus> {
    const bridge =
        options.bridge === undefined ? gsenderBridge() : options.bridge;
    let reply: GsenderReply;
    try {
        reply = bridge
            ? await bridge.ping(port)
            : await fetchWithTimeout(
                  `${baseUrl(port)}/ping`,
                  { method: 'GET' },
                  options,
              );
    } catch {
        return { state: 'unreachable' };
    }
    const body = reply.body as {
        app?: unknown;
        version?: unknown;
        enabled?: unknown;
        busy?: unknown;
    } | null;
    const ok = reply.status >= 200 && reply.status < 300;
    if (!ok || body?.app !== 'gSender') return { state: 'unreachable' };
    const version = String(body.version ?? '');
    if (body.enabled === false) return { state: 'disabled', version };
    if (body.busy) return { state: 'busy', version };
    return { state: 'ready', version };
}

const FAILURE_MESSAGES = {
    unreachable:
        "Couldn't reach gSender. Make sure it's open on this computer and up to date, or use Export G-code instead.",
    busy: 'gSender is running a job. The program was not loaded.',
    disabled:
        'gSender is set to refuse files from gCAM. Turn on "Allow gCAM to send files" in gSender settings.',
    refused: 'gSender refused the connection from this page.',
    'too-large': 'The program is too large to send. Use Export G-code instead.',
    failed: 'gSender could not load the program.',
} as const;

function failure(
    reason: keyof typeof FAILURE_MESSAGES,
): GsenderSendResult & { ok: false } {
    return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

export async function sendGcodeToGsender(
    port: number,
    name: string,
    gcode: string,
    options: ClientOptions = {},
): Promise<GsenderSendResult> {
    const bridge =
        options.bridge === undefined ? gsenderBridge() : options.bridge;
    let reply: GsenderReply;
    try {
        reply = bridge
            ? await bridge.send({ port, name, gcode })
            : await fetchWithTimeout(
                  `${baseUrl(port)}/load`,
                  {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name, gcode }),
                  },
                  { timeoutMs: SEND_TIMEOUT_MS, ...options },
              );
    } catch {
        return failure('unreachable');
    }
    switch (reply.status) {
        case 0:
            return failure('unreachable');
        case 202: {
            const body = reply.body as { name?: unknown } | null;
            return { ok: true, name: String(body?.name ?? name) };
        }
        case 409:
            return failure('busy');
        case 503:
            return failure('disabled');
        case 403:
            return failure('refused');
        case 413:
            return failure('too-large');
        case 404:
            return failure('unreachable');
        default:
            return failure('failed');
    }
}
