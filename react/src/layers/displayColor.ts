/** Keep imported white/black and pale colours visible on either canvas theme. */
export function layerDisplayColor(
    color: string | undefined,
    background: string,
    fallback: string,
): string {
    if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback;
    const luminance = (hex: string) => {
        const channels = [1, 3, 5]
            .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) =>
                v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            );
        return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
    };
    const foreground = luminance(color),
        backdrop = luminance(background);
    const ratio =
        (Math.max(foreground, backdrop) + 0.05) /
        (Math.min(foreground, backdrop) + 0.05);
    return ratio >= 3 ? color : fallback;
}
