const { resolve, relative, isAbsolute } = require('node:path');

const APP_URL = 'gcam://app/';
/** Only the packaged renderer is available through the application origin. */
function assetPath(root, address) {
    const url = new URL(address);
    if (
        url.protocol !== 'gcam:' ||
        url.hostname !== 'app' ||
        url.port ||
        url.username ||
        url.password
    )
        return null;
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        return null;
    }
    if (pathname.includes('\\') || pathname.includes('\0')) return null;
    const file = resolve(
        root,
        `.${pathname === '/' ? '/index.html' : pathname}`,
    );
    const inside = relative(root, file);
    return inside.startsWith('..') || isAbsolute(inside) ? null : file;
}
function isAppUrl(address) {
    try {
        const url = new URL(address);
        return (
            url.origin === new URL(APP_URL).origin &&
            url.protocol === 'gcam:' &&
            url.hostname === 'app' &&
            !url.port &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}
function isExternalUrl(address) {
    try {
        const url = new URL(address);
        return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}
module.exports = { APP_URL, assetPath, isAppUrl, isExternalUrl };
