import { bitmapHeightmap } from '../lib/bitmap-heightmap';
import type { BitmapHeightmapWorkerRequest } from './cam-worker-protocol';

self.onmessage = (event: MessageEvent<BitmapHeightmapWorkerRequest>) => {
    const { id, request } = event.data;
    try {
        self.postMessage({ id, result: bitmapHeightmap(request) });
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
