import { prepareGcodePreview } from './prepare-gcode-preview';

self.onmessage = async (event: MessageEvent<string>) => {
    try {
        const data = await prepareGcodePreview(event.data, (progress) =>
            self.postMessage({ progress }),
        );
        self.postMessage(
            { data },
            {
                transfer: [
                    data.prefixEndVertex,
                    ...data.chunks.flatMap((chunk) => [
                        chunk.positions,
                        chunk.attrs,
                    ]),
                ],
            },
        );
    } catch (error) {
        self.postMessage({
            error:
                error instanceof Error
                    ? error.message
                    : 'G-code preview failed.',
        });
    }
};
