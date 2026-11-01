import { isBitmapFile, loadBitmapFile } from './bitmap';
import { traceBitmapInWorker } from '../engine/cam-worker-client';
import type { PlacedTrace } from './trace';

export interface BatchTraceSettings {
    mode: 'outline' | 'centerline';
    resolution: number;
}
export function batchSvgNames(names: string[]): string[] {
    const used = new Set<string>();
    return names.map((name) => {
        const stem =
            name
                .replace(/\.[^.]*$/, '')
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
                .trim()
                .slice(0, 100) || 'trace';
        let candidate = `${stem}.svg`,
            number = 2;
        while (used.has(candidate.toLowerCase()))
            candidate = `${stem} (${number++}).svg`;
        used.add(candidate.toLowerCase());
        return candidate;
    });
}
export function tracedSvg(
    paths: PlacedTrace[],
    width: number,
    height: number,
    units: 'mm' | 'px',
    mode: BatchTraceSettings['mode'],
): string {
    if (![width, height].every((n) => Number.isFinite(n) && n > 0))
        throw new Error('Invalid SVG dimensions.');
    const commands = paths
        .map(({ points }) => {
            if (
                points.length < 2 ||
                points.some(
                    (p) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
                )
            )
                throw new Error('Invalid traced SVG geometry.');
            const closed =
                points[0].x === points[points.length - 1].x &&
                points[0].y === points[points.length - 1].y;
            return (
                points
                    .slice(0, closed ? -1 : undefined)
                    .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${height - p.y}`)
                    .join(' ') + (closed ? ' Z' : '')
            );
        })
        .join(' ');
    const paint =
        mode === 'centerline'
            ? `fill="none" stroke="black" stroke-width="${units === 'mm' ? 0.2 : 1}"`
            : 'fill="black" fill-rule="evenodd"';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}${units}" height="${height}${units}" viewBox="0 0 ${width} ${height}"><path ${paint} d="${commands}"/></svg>\n`;
}
export async function traceFileToSvg(
    file: File,
    settings: BatchTraceSettings,
    signal: AbortSignal,
): Promise<{ svg: string; paths: number }> {
    const check = () => {
        if (signal.aborted)
            throw new DOMException('Trace cancelled.', 'AbortError');
    };
    check();
    if (
        !['outline', 'centerline'].includes(settings.mode) ||
        ![0, 800, 1600, 3200].includes(settings.resolution)
    )
        throw new Error('Invalid batch trace settings.');
    if (!isBitmapFile(file))
        throw new Error('Choose a bitmap image (PNG, JPEG, WebP, BMP or GIF).');
    const loaded = await loadBitmapFile(file, true);
    check();
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Could not decode image.'));
        image.src = loaded.dataUrl;
    });
    check();
    const scale = settings.resolution
        ? Math.min(
              1,
              settings.resolution / Math.max(loaded.pixelW, loaded.pixelH),
          )
        : 1;
    const pw = Math.max(1, Math.round(loaded.pixelW * scale)),
        ph = Math.max(1, Math.round(loaded.pixelH * scale));
    if (pw * ph > 16777216)
        throw new Error(
            'Trace exceeds 16 million pixels; choose a lower resolution.',
        );
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not read image pixels.');
    context.drawImage(image, 0, 0, pw, ph);
    const width = loaded.physicalSize?.wMm ?? loaded.pixelW,
        height = loaded.physicalSize?.hMm ?? loaded.pixelH;
    const task = traceBitmapInWorker({
        image: context.getImageData(0, 0, pw, ph),
        placement: { x: 0, y: 0, width, height },
        options: {
            traceMode: settings.mode,
            brightness: 0,
            contrast: 0,
            threshold: 128,
            invert: false,
            turdsize: 2,
        },
    });
    const abort = () => task.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
        const paths = await task.promise;
        check();
        if (!paths.length) throw new Error('No shapes found.');
        return {
            svg: tracedSvg(
                paths,
                width,
                height,
                loaded.physicalSize ? 'mm' : 'px',
                settings.mode,
            ),
            paths: paths.length,
        };
    } finally {
        signal.removeEventListener('abort', abort);
        canvas.width = canvas.height = 0;
    }
}
