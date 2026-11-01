import type { LaserRotarySetup } from '../cam/laser-rotary.js';
import { prepareGcodePreview } from './prepare-gcode-preview';

self.onmessage = async (
    event: MessageEvent<
        | string
        | {
              gcode: string;
              laser?: boolean;
              laserMax?: number;
              laserRotary?: LaserRotarySetup;
          }
    >,
) => {
    try {
        const request =
            typeof event.data === 'string' ? { gcode: event.data } : event.data;
        const data = await prepareGcodePreview(
            request.gcode,
            (progress) => self.postMessage({ progress }),
            request,
        );
        self.postMessage(
            { data },
            {
                transfer: [
                    data.prefixEndVertex,
                    ...data.chunks.flatMap((chunk) => [
                        chunk.positions,
                        chunk.attrs,
                        ...(chunk.power ? [chunk.power] : []),
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
