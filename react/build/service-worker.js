/* Values are supplied by the production build, including the GitHub Pages base. */
const BASE = __GCAM_BASE__;
const VERSION = __GCAM_VERSION__;
const PRECACHE = __GCAM_PRECACHE__;
const PREFIX = `gcam:${BASE}:`;
const CACHE = `${PREFIX}${VERSION}`;

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Keep one previous build so another open tab can still load its chunks.
            const old = (await caches.keys()).filter(
                (name) => name.startsWith(PREFIX) && name !== CACHE,
            );
            await Promise.all(
                old.slice(0, -1).map((name) => caches.delete(name)),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (
        request.method !== 'GET' ||
        url.origin !== self.location.origin ||
        !url.pathname.startsWith(BASE) ||
        request.headers.has('range')
    )
        return;
    const relative = url.pathname.slice(BASE.length);
    const navigation = request.mode === 'navigate';
    const asset =
        /^(assets|icons|library|samples|vendor)\//.test(relative) ||
        relative === 'manifest.webmanifest';
    if (!navigation && !asset) return;
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE);
            // The shell and hashed assets belong to the active worker's build.
            const key = navigation ? `${BASE}index.html` : request;
            const current = await cache.match(key, { ignoreVary: true });
            if (current) return current;
            // Older hashed chunks can still be needed by another open tab.
            if (
                relative.startsWith('assets/') &&
                /-[\w-]+\.(js|css)$/.test(relative)
            ) {
                for (const name of (await caches.keys()).filter(
                    (name) => name.startsWith(PREFIX) && name !== CACHE,
                )) {
                    const previous = await (await caches.open(name)).match(
                        request,
                        { ignoreVary: true },
                    );
                    if (previous) return previous;
                }
            }
            const response = await fetch(request);
            if (response.ok && response.type !== 'opaque' && asset) {
                event.waitUntil(cache.put(request, response.clone()));
            }
            return response;
        })(),
    );
});
