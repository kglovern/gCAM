/**
 * Purpose: "Send to gSender" transport for the desktop app. gSender's handoff
 * listener (src/electron-app/GcamHandoff.js in gSender) lives on loopback and
 * checks the page Origin. Our renderer's Origin is gcam://app, and Chromium
 * may gate custom-scheme -> loopback requests behind a local network
 * permission we deny, so the request goes from here instead: main-process
 * fetch sends no Origin, which gSender accepts from local clients.
 *
 * Only the HTTP status and JSON body go back to the renderer; it maps them
 * with the same code the web build uses (react/src/integrations/gsender).
 */

const PING_TIMEOUT_MS = 4000;
// Large programs can take a moment to serialise and write on the gSender side.
const SEND_TIMEOUT_MS = 30000;
const UNREACHABLE = { status: 0, body: null };

function isValidPort(port) {
    return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

async function request(port, path, init, timeoutMs, fetchImpl) {
    // The renderer only chooses the port; the host is always loopback.
    if (!isValidPort(port)) return UNREACHABLE;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(
            `http://127.0.0.1:${port}/gcam/v1/${path}`,
            {
                ...init,
                signal: controller.signal,
            },
        );
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    } catch {
        return UNREACHABLE;
    } finally {
        clearTimeout(timer);
    }
}

function createGsenderClient({
    fetchImpl = fetch,
    pingTimeoutMs = PING_TIMEOUT_MS,
    sendTimeoutMs = SEND_TIMEOUT_MS,
} = {}) {
    return {
        ping: (port) =>
            request(port, 'ping', { method: 'GET' }, pingTimeoutMs, fetchImpl),
        send: ({ port, name, gcode } = {}) =>
            typeof gcode === 'string'
                ? request(
                      port,
                      'load',
                      {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              name: String(name ?? ''),
                              gcode,
                          }),
                      },
                      sendTimeoutMs,
                      fetchImpl,
                  )
                : Promise.resolve({ status: 400, body: null }),
    };
}

module.exports = { createGsenderClient };
