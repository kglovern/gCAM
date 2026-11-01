/**
 * Purpose: Implementation module for vcarve in the react domain.
 */
const VCARVE_CLIPPER_SCALE = 1270000000 / 25.4;
const VCARVE_VERSION = '20261101-vcarve9';

let workerRef = null;
let requestId = 0;
let ready = false;
let readyPromise = null;
let loadError = null;
const pendingRequests = new Map();

function getWorker() {
    if (workerRef) {
        return workerRef;
    }
    workerRef = new Worker(new URL(`./vcarve-worker.js`, import.meta.url), {
        type: 'module',
    });
    workerRef.addEventListener('message', handleWorkerMessage);
    workerRef.addEventListener('error', (event) => {
        const error = new Error(event.message || 'V-Carve worker failed.');
        loadError = error;
        readyPromise = null;
        rejectAllPending(error);
    });
    return workerRef;
}

function handleWorkerMessage(event) {
    const { id, result, error, progress } = event.data || {};

    const pending = pendingRequests.get(id);
    if (!pending) {
        return;
    }
    if (progress) {
        pending.onProgress?.(progress);
        return;
    }
    pendingRequests.delete(id);

    if (error) {
        const err = new Error(error);
        if (pending.kind === 'ready') {
            loadError = err;
            readyPromise = null;
        }
        pending.reject(err);
        return;
    }

    if (pending.kind === 'ready' || pending.kind === 'vcarve') {
        ready = true;
        loadError = null;
    }
    pending.resolve(result);
}

function rejectAllPending(error) {
    for (const pending of pendingRequests.values()) {
        pending.reject(error);
    }
    pendingRequests.clear();
}

function postWorkerRequest(kind, payload = {}, options = {}) {
    const worker = getWorker();
    const id = ++requestId;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, {
            resolve,
            reject,
            kind,
            onProgress: options.onProgress,
        });
        worker.postMessage({ id, type: kind, ...payload });
    });
}

export function getVCarveLoadError() {
    return loadError;
}

export function isVCarveReady() {
    return ready;
}

export function ensureVCarveReady() {
    if (ready) {
        return Promise.resolve();
    }
    if (readyPromise) {
        return readyPromise;
    }
    readyPromise = postWorkerRequest('ensure-ready').catch((error) => {
        loadError = error instanceof Error ? error : new Error(String(error));
        readyPromise = null;
        throw loadError;
    });
    return readyPromise;
}

export function mmPointsToClipperPath(points) {
    return points.slice(0, -1).map((point) => ({
        X: Math.round(point.x * VCARVE_CLIPPER_SCALE),
        Y: Math.round(point.y * VCARVE_CLIPPER_SCALE),
    }));
}

export async function generateVCarveToolpaths(
    paths,
    { cutterAngle, passDepth, maxDepth, onProgress },
) {
    try {
        return await postWorkerRequest(
            'vcarve',
            {
                paths,
                cutterAngle,
                passDepth,
                maxDepth,
            },
            { onProgress },
        );
    } catch (error) {
        loadError = error instanceof Error ? error : new Error(String(error));
        throw loadError;
    }
}
