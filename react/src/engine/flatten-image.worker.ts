import { flattenImageRegion } from '../lib/flatten-image';
import type { FlattenImageWorkerRequest } from './cam-worker-protocol';
self.onmessage = ({ data }: { data: FlattenImageWorkerRequest }) => {
    try {
        const result = flattenImageRegion(data.request, (percent) =>
            self.postMessage({
                id: data.id,
                progress: { percent, label: 'Flattening image' },
            }),
        );
        self.postMessage({ id: data.id, result }, [result.data.buffer]);
    } catch (error) {
        self.postMessage({
            id: data.id,
            error: error instanceof Error ? error.message : String(error),
            stack: null,
        });
    }
};
