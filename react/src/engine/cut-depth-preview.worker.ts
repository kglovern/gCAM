import { buildCutDepthPreview } from '../lib/cut-depth-preview';
import type { CutDepthPreviewWorkerRequest } from './cam-worker-protocol';
self.onmessage = (event: MessageEvent<CutDepthPreviewWorkerRequest>) => {
    const { id, toolpaths, stockThickness } = event.data;
    try {
        const result = buildCutDepthPreview(toolpaths, stockThickness);
        self.postMessage({ id, result }, [
            result.light.buffer,
            result.dark.buffer,
        ]);
    } catch (e) {
        self.postMessage({
            id,
            error: e instanceof Error ? e.message : String(e),
        });
    }
};
