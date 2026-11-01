import { repairPaths } from '../lib/path-repair';
import { arrangeArtwork } from '../lib/arrange-artwork';
import { patternArtwork } from '../lib/pattern-artwork';
import type {
    PathRepairWorkerRequest,
    ArrangeArtworkWorkerRequest,
    PatternArtworkWorkerRequest,
} from './cam-worker-protocol';
self.onmessage = (
    event: MessageEvent<
        | PathRepairWorkerRequest
        | ArrangeArtworkWorkerRequest
        | PatternArtworkWorkerRequest
    >,
) => {
    const data = event.data;
    const { id } = data;
    try {
        self.postMessage({
            id,
            result:
                data.type === 'pattern-artwork'
                    ? patternArtwork(data.request.shapes, data.request.settings)
                    : data.type === 'arrange-artwork'
                      ? arrangeArtwork(data.request.source, data.request.action)
                      : repairPaths(data.request),
        });
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
