/* Retire previously installed offline workers without touching saved projects. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            await self.clients.claim();
            for (const name of await caches.keys()) {
                if (
                    name.startsWith(
                        `gcam:${new URL(self.registration.scope).pathname}:`,
                    )
                )
                    await caches.delete(name);
            }
            await self.registration.unregister();
        })(),
    );
});
