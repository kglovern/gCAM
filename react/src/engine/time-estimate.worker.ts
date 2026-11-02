import { prepareTimedPreview } from './prepare-timed-preview';
import {
    estimateProgramTime,
    type TimingSettings,
} from '../gcode/estimateTime';
import type { OutputSettings } from '../gcode/profiles';

self.onmessage = async (
    event: MessageEvent<{
        gcode: string;
        settings: TimingSettings;
        dwell: OutputSettings['dwell'];
        laserMax?: number;
    }>,
) => {
    try {
        const result = await estimateProgramTime(
            event.data.gcode,
            event.data.settings,
            event.data.dwell,
            (progress) =>
                self.postMessage({ progress: Math.floor(progress * 0.9) }),
            true,
        );
        const { lineEndSeconds: _timeline, playback, ...summary } = result;
        if (!playback) throw new Error('No planned motion returned.');
        const preview = await prepareTimedPreview(
            event.data.gcode,
            playback,
            event.data.laserMax,
            (progress) =>
                self.postMessage({ progress: 90 + Math.floor(progress / 10) }),
        );
        self.postMessage(
            { result: { ...summary, preview } },
            {
                transfer: [
                    ...playback.chunks.flatMap((chunk) => [
                        chunk.values.buffer,
                        chunk.lines.buffer,
                    ]),
                    preview.geometry.prefixEndVertex,
                    ...preview.geometry.chunks.flatMap((chunk) => [
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
                    : 'Time estimate failed.',
        });
    }
};
