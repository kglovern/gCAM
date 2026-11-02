import { tracePixels } from '../lib/trace-pixels';
import type {
    TraceBitmapRequest,
    CamWorkerMessage,
} from './cam-worker-protocol';

self.onmessage = (event: MessageEvent<TraceBitmapRequest>) => {
    const { data } = event;
    let message: CamWorkerMessage;
    try {
        message = { id: data.id, result: tracePixels(data) };
    } catch (error) {
        message = {
            id: data.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? (error.stack ?? null) : null,
        };
    }
    self.postMessage(message);
};
