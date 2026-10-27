const DOWNLOADS = 'https://github.com/petervanderwalt/gCAM/releases/download/';

export const RELEASES_URL = 'https://github.com/petervanderwalt/gCAM/releases';
export const RELEASE_API =
    'https://api.github.com/repos/petervanderwalt/gCAM/releases/latest';

export function newerVersion(candidate: string, current: string): boolean {
    const valid = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
    if (!valid.test(candidate) || !valid.test(current)) return false;
    const left = candidate.split('.').map(Number);
    const right = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] > right[i];
    }
    return false;
}

export function appleUpdateUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port &&
            ((url.hostname === 'testflight.apple.com' &&
                /^\/join\/[A-Za-z0-9]+$/.test(url.pathname)) ||
                (url.hostname === 'apps.apple.com' &&
                    /\/id\d+$/.test(url.pathname)))
            ? url.href
            : null;
    } catch {
        return null;
    }
}

/** Only the expected signed APK from this repository can be offered. */
export function androidRelease(data: unknown, current: string) {
    const release = data as {
        tag_name?: unknown;
        draft?: boolean;
        prerelease?: boolean;
        assets?: { name: string; browser_download_url: string }[];
    } | null;
    if (
        !release ||
        release.draft ||
        release.prerelease ||
        typeof release.tag_name !== 'string' ||
        !Array.isArray(release.assets)
    )
        return null;
    const version = release.tag_name.replace(/^v/, '');
    if (release.tag_name !== `v${version}` || !newerVersion(version, current))
        return null;
    const name = `gCAM-${version}-android.apk`;
    const url = `${DOWNLOADS}v${version}/${name}`;
    return release.assets.some(
        (asset) => asset?.name === name && asset.browser_download_url === url,
    )
        ? { version, url }
        : null;
}
