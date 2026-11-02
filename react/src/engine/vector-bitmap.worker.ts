import './clipper-shim.js';
import {
    prepareVectorBitmap,
    paintVectorBitmap,
    vectorBitmapPng,
} from '../lib/vector-bitmap';
import type {
    VectorBitmapWorkerRequest,
    CamWorkerMessage,
} from './cam-worker-protocol';
self.onmessage = async (event: MessageEvent<VectorBitmapWorkerRequest>) => {
    const data = event.data;
    try {
        const plan = prepareVectorBitmap(data.request);
        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(plan.widthPx, plan.heightPx)
                : null;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) {
            self.postMessage({ id: data.id, result: { plan } });
            return;
        }
        paintVectorBitmap(context, plan);
        const png = await vectorBitmapPng(
            await canvas.convertToBlob({ type: 'image/png' }),
            plan,
        );
        self.postMessage(
            {
                id: data.id,
                result: { plan: { ...plan, fills: [], outlines: [] }, png },
            },
            [png],
        );
    } catch (error) {
        const message: CamWorkerMessage = {
            id: data.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? (error.stack ?? null) : null,
        };
        self.postMessage(message);
    }
};
