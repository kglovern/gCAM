import type { PreviewLoop } from './types';
import { formatLength, type UnitSystem } from '../lib/units';
import { pocketDepthColor } from './pocketDepthPreview';
export function CutDepthLegend({
    preview,
    units,
    dark,
}: {
    preview: PreviewLoop[];
    units: UnitSystem;
    dark: boolean;
}) {
    const image = preview.find((p) => p.depthImage)?.depthImage,
        error = preview.find((p) => p.depthPreviewError)?.depthPreviewError,
        pending = preview.some((p) => p.depthPreviewPending);
    const depths =
        image?.depths ??
        [
            ...new Set(
                preview.flatMap((p) => (p.pocket ? [p.pocket.depthMm] : [])),
            ),
        ].sort((a, b) => a - b);
    if (!depths.length && !error && !pending) return null;
    const pocketOnly = image
        ? image.operations.every((o) => o === 'pocket')
        : depths.length > 0;
    return (
        <div
            aria-label={pocketOnly ? 'Pocket depths' : 'Cut depths'}
            title={
                error ??
                (image
                    ? `Approximate cutter-depth preview, ${image.cellMm.toFixed(2)} mm samples. Not collision verification.`
                    : undefined)
            }
            className="pointer-events-none absolute bottom-3 left-10 z-10 flex max-w-[75%] flex-wrap items-center gap-2 rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs text-slate-800 dark:border-slate-600 dark:bg-dark/95 dark:text-slate-100"
        >
            <span>{pocketOnly ? 'Pocket depth' : 'Cut depth'}</span>
            {depths.slice(0, 6).map((depth) => {
                const through =
                    image?.stockThickness !== undefined &&
                    depth >= image.stockThickness - 1e-4;
                return (
                    <span
                        key={depth}
                        className="inline-flex items-center gap-1"
                    >
                        <span
                            aria-hidden="true"
                            className="inline-block h-3 w-3 border border-slate-500"
                            style={{
                                backgroundColor: through
                                    ? dark
                                        ? 'rgb(5,9,16)'
                                        : 'rgb(100,116,139)'
                                    : pocketDepthColor(depth, dark),
                            }}
                        />
                        {formatLength(depth, units)}
                        {through ? ' through' : ''}
                    </span>
                );
            })}
            {depths.length > 6 && <span>+{depths.length - 6}</span>}
            {!image && (
                <span role="status">
                    {error
                        ? 'Shading unavailable'
                        : pending
                          ? 'Calculating…'
                          : null}
                </span>
            )}
        </div>
    );
}
