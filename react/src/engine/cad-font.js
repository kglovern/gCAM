/**
 * Purpose: Implementation module for cad-font in the engine domain.
 */
import { parse as parseOpenType } from './opentype.module.js';
import { EXTRA_FONT_OPTIONS } from './google-font-catalog.js';

import { GLYPHS } from './fonts/stroke-glyphs.js';

const publicAssetUrl = (asset) => `${import.meta.env.BASE_URL || '/'}${asset}`;

export const FONT_OPTIONS = [
    {
        id: 'single-line',
        name: 'Single Line Engraving',
        kind: 'stroke',
        family: 'CadEngraving',
    },
    {
        id: 'space-mono',
        name: 'Space Mono',
        kind: 'outline',
        family: 'Space Mono',
        asset: 'assets/fonts/SpaceMono-Regular.ttf',
    },
    {
        id: 'anton',
        name: 'Anton',
        kind: 'outline',
        family: 'Anton',
        asset: 'assets/fonts/Anton-Regular.ttf',
    },
    {
        id: 'bebas-neue',
        name: 'Bebas Neue',
        kind: 'outline',
        family: 'Bebas Neue',
        asset: 'assets/fonts/BebasNeue-Regular.ttf',
    },
    {
        id: 'righteous',
        name: 'Righteous',
        kind: 'outline',
        family: 'Righteous',
        asset: 'assets/fonts/Righteous-Regular.ttf',
    },
    {
        id: 'bungee',
        name: 'Bungee',
        kind: 'outline',
        family: 'Bungee',
        asset: 'assets/fonts/Bungee-Regular.ttf',
    },
    {
        id: 'black-ops-one',
        name: 'Black Ops One',
        kind: 'outline',
        family: 'Black Ops One',
        asset: 'assets/fonts/BlackOpsOne-Regular.ttf',
    },
    {
        id: 'stardos-stencil',
        name: 'Stardos Stencil',
        kind: 'outline',
        family: 'Stardos Stencil',
        asset: 'assets/fonts/StardosStencil-Bold.ttf',
    },
    {
        id: 'lobster',
        name: 'Lobster',
        kind: 'outline',
        family: 'Lobster',
        asset: 'assets/fonts/Lobster-Regular.ttf',
    },
    {
        id: 'archivo-black',
        name: 'Archivo Black',
        kind: 'outline',
        family: 'Archivo Black',
        asset: 'assets/fonts/ArchivoBlack-Regular.ttf',
    },
    {
        id: 'audiowide',
        name: 'Audiowide',
        kind: 'outline',
        family: 'Audiowide',
        asset: 'assets/fonts/Audiowide-Regular.ttf',
    },
    {
        id: 'bangers',
        name: 'Bangers',
        kind: 'outline',
        family: 'Bangers',
        asset: 'assets/fonts/Bangers-Regular.ttf',
    },
    {
        id: 'barlow-condensed',
        name: 'Barlow Condensed',
        kind: 'outline',
        family: 'Barlow Condensed',
        asset: 'assets/fonts/BarlowCondensed-Regular.ttf',
    },
    {
        id: 'dm-serif-display',
        name: 'DM Serif Display',
        kind: 'outline',
        family: 'DM Serif Display',
        asset: 'assets/fonts/DMSerifDisplay-Regular.ttf',
    },
    {
        id: 'fjalla-one',
        name: 'Fjalla One',
        kind: 'outline',
        family: 'Fjalla One',
        asset: 'assets/fonts/FjallaOne-Regular.ttf',
    },
    {
        id: 'fredericka-the-great',
        name: 'Fredericka the Great',
        kind: 'outline',
        family: 'Fredericka the Great',
        asset: 'assets/fonts/FrederickatheGreat-Regular.ttf',
    },
    {
        id: 'graduate',
        name: 'Graduate',
        kind: 'outline',
        family: 'Graduate',
        asset: 'assets/fonts/Graduate-Regular.ttf',
    },
    {
        id: 'lilita-one',
        name: 'Lilita One',
        kind: 'outline',
        family: 'Lilita One',
        asset: 'assets/fonts/LilitaOne-Regular.ttf',
    },
    {
        id: 'pacifico',
        name: 'Pacifico',
        kind: 'outline',
        family: 'Pacifico',
        asset: 'assets/fonts/Pacifico-Regular.ttf',
    },
    {
        id: 'press-start-2p',
        name: 'Press Start 2P',
        kind: 'outline',
        family: 'Press Start 2P',
        asset: 'assets/fonts/PressStart2P-Regular.ttf',
    },
    {
        id: 'rubik-mono-one',
        name: 'Rubik Mono One',
        kind: 'outline',
        family: 'Rubik Mono One',
        asset: 'assets/fonts/RubikMonoOne-Regular.ttf',
    },
    {
        id: 'russo-one',
        name: 'Russo One',
        kind: 'outline',
        family: 'Russo One',
        asset: 'assets/fonts/RussoOne-Regular.ttf',
    },
    {
        id: 'saira-stencil-one',
        name: 'Saira Stencil One',
        kind: 'outline',
        family: 'Saira Stencil One',
        asset: 'assets/fonts/SairaStencilOne-Regular.ttf',
    },
    ...EXTRA_FONT_OPTIONS,
];

const outlineFontCache = new Map();

function registerCatalogFontFaces() {
    if (typeof document === 'undefined') {
        return;
    }
    const style =
        document.getElementById('cad-font-catalog') ||
        document.createElement('style');
    style.id = 'cad-font-catalog';
    style.textContent = FONT_OPTIONS.filter((option) => option.asset)
        .map(
            ({ family, asset }) =>
                `@font-face { font-family: "${family}"; src: url("${publicAssetUrl(asset)}") format("truetype"); font-display: swap; }`,
        )
        .join('\n');
    document.head.append(style);
}

registerCatalogFontFaces();

export function createStrokeText(text, origin, height) {
    const scale = Math.max(0.1, height) / 6;
    let cursor = origin.x;
    const strokes = [];
    for (const character of String(text || '').toUpperCase()) {
        if (character === ' ') {
            cursor += scale * 3;
            continue;
        }
        const glyph = GLYPHS[character] || GLYPHS['-'];
        for (const stroke of glyph) {
            strokes.push(
                stroke.map(([x, y]) => ({
                    x: cursor + x * scale,
                    y: origin.y + y * scale,
                })),
            );
        }
        cursor += scale * 5;
    }
    return strokes;
}

export async function loadOutlineFont(fontId) {
    const option = FONT_OPTIONS.find((candidate) => candidate.id === fontId);
    if (!option?.asset) {
        throw new Error('The selected outline font is unavailable.');
    }
    if (outlineFontCache.has(fontId)) {
        return outlineFontCache.get(fontId);
    }
    const response = await fetch(publicAssetUrl(option.asset));
    if (!response.ok) {
        throw new Error(`Could not load ${option.name}.`);
    }
    const font = parseOpenType(await response.arrayBuffer());
    outlineFontCache.set(fontId, font);
    return font;
}

export function createOutlineText(font, text, origin, height) {
    const path = font.getPath(text, 0, 0, height);
    const contours = [];
    let contour = null;
    let cursor = null;
    let start = null;

    const appendPoint = (x, y) => {
        const point = { x: origin.x + x, y: origin.y - y };
        if (
            !contour ||
            !cursor ||
            Math.hypot(point.x - cursor.x, point.y - cursor.y) > 1e-6
        ) {
            contour.push(point);
            cursor = point;
        }
    };
    const closeContour = () => {
        if (contour?.length > 1 && start) {
            appendPoint(start.x - origin.x, origin.y - start.y);
            contours.push(contour);
        }
        contour = null;
        cursor = null;
        start = null;
    };

    for (const command of path.commands) {
        if (command.type === 'M') {
            closeContour();
            contour = [];
            appendPoint(command.x, command.y);
            start = cursor;
        } else if (command.type === 'L') {
            appendPoint(command.x, command.y);
        } else if (command.type === 'Q' && cursor) {
            const from = { x: cursor.x - origin.x, y: origin.y - cursor.y };
            for (let step = 1; step <= 8; step += 1) {
                const t = step / 8;
                const mt = 1 - t;
                appendPoint(
                    mt * mt * from.x +
                        2 * mt * t * command.x1 +
                        t * t * command.x,
                    mt * mt * from.y +
                        2 * mt * t * command.y1 +
                        t * t * command.y,
                );
            }
        } else if (command.type === 'C' && cursor) {
            const from = { x: cursor.x - origin.x, y: origin.y - cursor.y };
            for (let step = 1; step <= 12; step += 1) {
                const t = step / 12;
                const mt = 1 - t;
                appendPoint(
                    mt ** 3 * from.x +
                        3 * mt ** 2 * t * command.x1 +
                        3 * mt * t ** 2 * command.x2 +
                        t ** 3 * command.x,
                    mt ** 3 * from.y +
                        3 * mt ** 2 * t * command.y1 +
                        3 * mt * t ** 2 * command.y2 +
                        t ** 3 * command.y,
                );
            }
        } else if (command.type === 'Z') {
            closeContour();
        }
    }
    closeContour();

    // OpenType's font size is an em square. Normalize its visible outlines so
    // the CAD height means the physical height users see and machine.
    const points = contours.flat();
    if (!points.length) {
        return contours;
    }
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const visibleHeight = maxY - minY;
    if (!Number.isFinite(visibleHeight) || visibleHeight <= 1e-9) {
        return contours;
    }
    const scale = Math.max(0.1, height) / visibleHeight;
    return contours.map((contour) =>
        contour.map((point) => ({
            x: origin.x + (point.x - origin.x) * scale,
            y: origin.y + (point.y - origin.y) * scale,
        })),
    );
}
