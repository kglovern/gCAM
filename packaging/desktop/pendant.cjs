/**
 * Purpose: "Send to Tablet" — pairs gCAM with gSender pendant tablets on the
 * LAN and uploads programs to them. Runs in the Electron main process because
 * the renderer can't browse mDNS or make plain-HTTP calls to LAN hosts.
 *
 * Speaks the same protocol as gSender's desktop side
 * (src/server/services/pendantDiscovery in gSender): the tablet advertises
 * _gsender-pendant._tcp, scans our QR (or shows a 6-digit code), and we claim
 * that against its receiver to get a key. The tablet never connects back.
 * Keys stay in this process; the renderer only ever sees tablet metadata.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');

const SERVICE_TYPE = 'gsender-pendant';
const DEFAULT_PORT = 8010;
const IDLE_STOP_MS = 2 * 60 * 1000;
const QR_TTL_MS = 2 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 3000;
const SEND_TIMEOUT_MS = 30000;
const PROBE_TIMEOUT_MS = 1500;
const SCAN_INTERVAL_MS = 15000;

const pickIPv4 = (service) =>
    (service.addresses || []).find((addr) =>
        /^\d{1,3}(\.\d{1,3}){3}$/.test(addr),
    ) ||
    service.referer?.address ||
    null;

async function postWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Every other address on this computer's /24 networks, on the default
 * receiver port. Used when mDNS finds nothing: plenty of tablets and mesh
 * routers drop multicast while plain HTTP to the receiver works fine.
 */
function subnetTargets() {
    const targets = [];
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const addr of addresses || []) {
            if (addr.family !== 'IPv4' || addr.internal) continue;
            const prefix = addr.address.split('.').slice(0, 3).join('.');
            for (let i = 1; i < 255; i++) {
                const host = `${prefix}.${i}`;
                if (host !== addr.address)
                    targets.push({ host, port: DEFAULT_PORT });
            }
        }
    }
    return targets;
}

async function probeStatus({ host, port }) {
    try {
        const res = await postWithTimeout(
            `http://${host}:${port}/pendant/status`,
            { method: 'GET' },
            PROBE_TIMEOUT_MS,
        );
        const status = res.ok ? await res.json() : null;
        if (status?.status !== 'ready' || !status.deviceId) return null;
        return {
            id: status.deviceId,
            name: status.deviceName || 'Tablet',
            host,
            port,
        };
    } catch {
        return null;
    }
}

function loadBonjour() {
    const { Bonjour } = require('bonjour-service');
    return new Bonjour(undefined, (err) =>
        console.warn(`[pendant] mDNS error: ${err?.message || err}`),
    );
}

function createPendantService({
    storePath,
    desktopName = `gCAM – ${os.hostname()}`,
    createBonjour = loadBonjour,
    scanTargets = subnetTargets,
    onChange = () => {},
}) {
    let store = readStore();
    let bonjour = null;
    let browser = null;
    let idleTimer = null;
    let activeQr = null;
    let scanning = null;
    let lastScanAt = 0;
    const discovered = new Map();

    function readStore() {
        try {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            return {
                desktopId:
                    typeof data.desktopId === 'string' ? data.desktopId : null,
                tablets:
                    data.tablets && typeof data.tablets === 'object'
                        ? data.tablets
                        : {},
            };
        } catch {
            return { desktopId: null, tablets: {} };
        }
    }

    function writeStore() {
        try {
            fs.writeFileSync(storePath, JSON.stringify(store, null, 2), {
                mode: 0o600,
            });
        } catch (err) {
            console.warn(`[pendant] could not save pairings: ${err.message}`);
        }
    }

    function desktopId() {
        if (!store.desktopId) {
            store.desktopId = crypto.randomUUID();
            writeStore();
        }
        return store.desktopId;
    }

    function emit() {
        onChange(list());
    }

    // Browsing only runs while the renderer keeps asking; the UI pings more
    // often than the idle timeout while it cares about tablets.
    function touch() {
        if (!browser) startBrowsing();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(stopBrowsing, IDLE_STOP_MS);
        idleTimer.unref?.();
    }

    function startBrowsing() {
        try {
            bonjour = createBonjour();
            browser = bonjour.find({ type: SERVICE_TYPE });
            browser.on('up', handleUp);
            browser.on('down', handleDown);
        } catch (err) {
            console.warn(`[pendant] discovery unavailable: ${err.message}`);
            bonjour = null;
            browser = null;
        }
    }

    function stopBrowsing() {
        clearTimeout(idleTimer);
        idleTimer = null;
        browser?.stop();
        browser = null;
        bonjour?.destroy();
        bonjour = null;
        if (discovered.size) {
            discovered.clear();
            emit();
        }
    }

    function remember({ id, name, host, port }, viaScan) {
        discovered.set(id, { id, name, host, port, viaScan });
        // Follow a paired tablet to its new address after a DHCP change.
        const entry = store.tablets[id];
        if (entry && (entry.lastHost !== host || entry.lastPort !== port)) {
            store.tablets[id] = { ...entry, lastHost: host, lastPort: port };
            writeStore();
        }
    }

    function handleUp(service) {
        const id = service.txt?.id;
        const host = pickIPv4(service);
        if (!id || !host) return;
        // bonjour-service advertisers add an id suffix for uniqueness.
        const name = String(service.name || 'Tablet').replace(
            /\s\([0-9a-f]{4}\)$/i,
            '',
        );
        remember({ id, name, host, port: service.port }, false);
        emit();
    }

    /**
     * Fallback discovery: asks every address on the local /24 for the
     * receiver's status page. Throttled; resolves once the sweep finishes.
     */
    function scan() {
        if (scanning || Date.now() - lastScanAt < SCAN_INTERVAL_MS)
            return scanning ?? Promise.resolve();
        lastScanAt = Date.now();
        scanning = Promise.all(scanTargets().map(probeStatus))
            .then((results) => {
                const found = new Map();
                for (const tablet of results)
                    if (tablet) found.set(tablet.id, tablet);
                for (const [id, entry] of discovered)
                    if (entry.viaScan && !found.has(id)) discovered.delete(id);
                // mDNS results win; they carry the advertised port.
                for (const tablet of found.values())
                    if (
                        !discovered.get(tablet.id) ||
                        discovered.get(tablet.id).viaScan
                    )
                        remember(tablet, true);
                emit();
            })
            .finally(() => {
                scanning = null;
            });
        return scanning;
    }

    function handleDown(service) {
        const id = service.txt?.id;
        if (id && discovered.delete(id)) emit();
    }

    /** Paired tablets (online or not) plus discovered unpaired ones. No keys. */
    function list() {
        const tablets = Object.entries(store.tablets).map(([id, entry]) => {
            const live = discovered.get(id);
            return {
                id,
                name: live?.name || entry.name,
                host: live?.host || entry.lastHost,
                port: live?.port || entry.lastPort,
                paired: true,
                online: Boolean(live),
            };
        });
        for (const [id, { viaScan, ...live }] of discovered) {
            if (!store.tablets[id])
                tablets.push({ ...live, paired: false, online: true });
        }
        return { browsing: Boolean(browser), tablets };
    }

    function discover() {
        touch();
        return list();
    }

    function createQr() {
        touch();
        void scan();
        const nonce = crypto.randomBytes(16).toString('base64url');
        activeQr = { nonce, expiresAt: Date.now() + QR_TTL_MS };
        const params = new URLSearchParams({
            v: '1',
            n: nonce,
            d: desktopId(),
            name: desktopName,
        });
        return {
            nonce,
            expiresAt: activeQr.expiresAt,
            payload: `gsender-pendant://pair?${params.toString()}`,
        };
    }

    async function claimAt(host, port, body) {
        const res = await postWithTimeout(
            `http://${host}:${port}/pendant/pair/claim`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
            CLAIM_TIMEOUT_MS,
        );
        if (!res.ok) {
            const err = new Error(`Claim rejected (${res.status})`);
            err.status = res.status;
            throw err;
        }
        const { key, deviceId, deviceName } = (await res.json()) || {};
        if (!key || !deviceId) throw new Error('Malformed pairing response');
        store.tablets[deviceId] = {
            name: deviceName || 'Tablet',
            key,
            lastHost: host,
            lastPort: port,
            pairedAt: Date.now(),
        };
        writeStore();
        emit();
        return { id: deviceId, name: store.tablets[deviceId].name, host, port };
    }

    /**
     * QR flow: tries the active nonce against every discovered tablet.
     * Resolves to {paired:true, tablet}, {paired:false} while nobody has
     * scanned it yet, or {expired:true} once a fresh QR is needed.
     */
    async function claimNonce(nonce) {
        if (
            !activeQr ||
            activeQr.nonce !== nonce ||
            activeQr.expiresAt <= Date.now()
        ) {
            return { paired: false, expired: true };
        }
        // Nothing answered mDNS: keep sweeping the subnet while the QR is up.
        if (![...discovered.values()].some((t) => !t.viaScan)) void scan();
        const body = { nonce, desktopId: desktopId(), desktopName };
        const results = await Promise.allSettled(
            [...discovered.values()].map(({ host, port }) =>
                claimAt(host, port, body),
            ),
        );
        const hit = results.find((r) => r.status === 'fulfilled');
        if (!hit) return { paired: false };
        activeQr = null;
        return { paired: true, tablet: hit.value };
    }

    /** Manual flow: exchanges the tablet's on-screen code for a key. */
    async function claimCode(host, port, code) {
        try {
            const tablet = await claimAt(host, port || DEFAULT_PORT, {
                code,
                desktopId: desktopId(),
                desktopName,
            });
            return { paired: true, tablet };
        } catch (err) {
            return {
                paired: false,
                message:
                    err.status === 404 || err.status === 401
                        ? 'Incorrect pairing code'
                        : err.status === 429
                          ? 'Too many attempts — wait a minute and try again'
                          : 'Could not reach the tablet — check the address and that its receiver is on',
            };
        }
    }

    function claim(request) {
        if (request?.nonce) return claimNonce(request.nonce);
        return claimCode(
            String(request?.host || '').trim(),
            Number(request?.port) || DEFAULT_PORT,
            String(request?.code || '').trim(),
        );
    }

    function forget(id) {
        if (!store.tablets[id]) return false;
        delete store.tablets[id];
        writeStore();
        emit();
        return true;
    }

    /** Uploads a program and asks the tablet to load it right away. */
    async function send({ tabletId, name, gcode }) {
        const entry = store.tablets[tabletId];
        if (!entry)
            return {
                ok: false,
                reason: 'unpaired',
                message: 'This tablet is not paired with gCAM',
            };
        const live = discovered.get(tabletId);
        const host = live?.host || entry.lastHost;
        const port = live?.port || entry.lastPort || DEFAULT_PORT;
        const form = new FormData();
        form.append('gcode', new Blob([gcode], { type: 'text/plain' }), name);
        form.append('mode', 'active');
        let res;
        try {
            res = await postWithTimeout(
                `http://${host}:${port}/pendant/file`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${entry.key}`,
                        'X-Pendant-Desktop-Id': desktopId(),
                        'X-Pendant-Filename': encodeURIComponent(name),
                    },
                    body: form,
                },
                SEND_TIMEOUT_MS,
            );
        } catch {
            return {
                ok: false,
                reason: 'unreachable',
                message: `Could not reach ${entry.name} — is it on this network with its receiver enabled?`,
            };
        }
        if (res.ok) return { ok: true };
        if (res.status === 401) {
            // The tablet dropped us; the stored key is useless now.
            forget(tabletId);
            return {
                ok: false,
                reason: 'unpaired',
                message: `${entry.name} no longer trusts gCAM — pair it again in Config`,
            };
        }
        if (res.status === 413)
            return {
                ok: false,
                reason: 'too-large',
                message: 'Program is too large for the tablet',
            };
        return {
            ok: false,
            reason: 'error',
            message: `Tablet rejected the program (${res.status})`,
        };
    }

    function dispose() {
        stopBrowsing();
    }

    return { discover, list, createQr, claim, forget, send, dispose };
}

module.exports = { createPendantService, SERVICE_TYPE };
