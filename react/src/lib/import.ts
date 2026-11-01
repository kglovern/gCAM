import { prepareSvgImages, type ImportedBitmap } from './svgImages';
import { svgDocumentSpace } from '../engine/svg-document.js';
/**
 * Purpose: Implementation module for import in the lib domain.
 */
import {
    normalizeLayers,
    DEFAULT_LAYER_ID,
    type DrawingLayer,
} from '../layers/model';
import { dxfLayerMetadata } from '../layers/importMetadata.js';
import { dxfUnitScaleToMm, parseDxf } from '../engine/dxf.js';
import { cxfTextStrokes, parseCxf } from '../engine/cxf.js';
import { parseSvg } from '../engine/svg.js';
import { SVG_CURVE_TOLERANCE } from '../geometry/curveFlattening.js';
import { buildLoops } from '../geometry/loops.js';
import { mergeBounds } from '../geometry/bounds.js';

/** Accurate, reusable empty-document prompt for the app's supported file types. */
export const IMPORT_START_STATUS =
    'Import a DXF/SVG drawing, STL/OBJ model, or image to begin.';

export interface ImportResult {
    fileName: string;
    entityCount: number;
    layers?: DrawingLayer[];
    bitmaps?: ImportedBitmap[];
    loops: {
        layerId?: string;
        bitmapId?: string;
        id?: string;
        points: { x: number; y: number }[];
    }[];
    bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } | null;
    /** Millimetres per source coordinate unit, or null when DXF units are unspecified. */
    unitScaleToMm: number | null;
    unitSource: 'dxf-metadata' | 'svg-physical-size' | 'svg-pixels' | 'unknown';
}

/** The scalar and document frame are shared with the SVG geometry importer. */
export function svgUnitScaleToMm(text: string): {
    scale: number;
    source: ImportResult['unitSource'];
} {
    const documentNode = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror'))
        throw new Error('Invalid SVG');
    const { scale, source } = svgDocumentSpace(documentNode.documentElement);
    return { scale, source: source as ImportResult['unitSource'] };
}

async function readFileText(file: File): Promise<string> {
    if (typeof (file as unknown as { text?: unknown }).text === 'function') {
        return file.text();
    }
    if (
        typeof (file as unknown as { arrayBuffer?: unknown }).arrayBuffer ===
        'function'
    ) {
        const buf = await file.arrayBuffer();
        return new TextDecoder().decode(buf);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.readAsText(file);
    });
}

export async function importVectorFile(
    file: File,
    svgScaleToMm?: number,
): Promise<ImportResult> {
    if (
        svgScaleToMm !== undefined &&
        (!Number.isFinite(svgScaleToMm) || svgScaleToMm <= 0)
    )
        throw new Error('Invalid SVG unit scale.');
    const text = await readFileText(file);
    const name = file.name.toLowerCase();
    const isDxf = name.endsWith('.dxf');
    const svgUnits = name.endsWith('.svg') ? svgUnitScaleToMm(text) : null;
    const unitScaleToMm = isDxf
        ? dxfUnitScaleToMm(text)
        : (svgUnits?.scale ?? null);
    const unitSource: ImportResult['unitSource'] = isDxf
        ? unitScaleToMm === null
            ? 'unknown'
            : 'dxf-metadata'
        : (svgUnits?.source ?? 'unknown');
    let entities = isDxf
        ? parseDxf(text)
        : name.endsWith('.svg')
          ? parseSvg(text, {
                coordinateSpace: 'cam',
                curveTolerance:
                    SVG_CURVE_TOLERANCE /
                    (svgScaleToMm ?? svgUnits?.scale ?? 1),
            })
          : (() => {
                throw new Error('Unsupported file — import .dxf or .svg');
            })();
    if (isDxf && entities.some((entity) => entity.type === 'CAD_TEXT')) {
        entities = await convertDxfTextToStrokes(entities);
    }
    const prepared = !isDxf
        ? await prepareSvgImages(entities, svgScaleToMm ?? unitScaleToMm ?? 1)
        : null;
    if (prepared) entities = prepared.entities;
    // Joining is deliberately confined to each source layer. Touching or
    // coincident geometry on Cuts and Pockets must remain independent.
    const table = isDxf ? dxfLayerMetadata(text) : new Map();
    const groups = new Map<string, typeof entities>();
    for (const source of table.keys()) groups.set(source, []);
    const importedLayers: DrawingLayer[] = [];
    for (const entity of entities) {
        const source = String(entity.layer || '0');
        const group = groups.get(source);
        if (group) group.push(entity);
        else groups.set(source, [entity]);
    }
    const loops = [...groups].flatMap(([source, group]) => {
        const layerId = source === '0' ? DEFAULT_LAYER_ID : `import:${source}`;
        const metadata = table.get(source);
        const svgEntity = (group[0] ?? {}) as {
            layerName?: string;
            layerColor?: string;
        };
        importedLayers.push({
            id: layerId,
            name: source === '0' ? 'Default' : svgEntity.layerName || source,
            color: metadata?.color || svgEntity.layerColor,
        });
        return buildLoops(group).map((loop) => {
            const indexes = loop.sourceEntityIndexes ?? [];
            const bitmapId =
                indexes.length === 1 ? group[indexes[0]]?.bitmapId : undefined;
            return { ...loop, layerId, ...(bitmapId ? { bitmapId } : {}) };
        });
    });
    const layers = normalizeLayers(importedLayers, loops);
    const bounds = mergeBounds(loops.map((l) => l.bounds).filter(Boolean));
    return {
        fileName: file.name,
        ...(prepared?.bitmaps.length ? { bitmaps: prepared.bitmaps } : {}),
        entityCount: entities.length,
        layers,
        loops,
        bounds,
        unitScaleToMm,
        unitSource,
    };
}

let courierCadFontPromise: Promise<ReturnType<typeof parseCxf>> | null = null;

async function convertDxfTextToStrokes(entities: ReturnType<typeof parseDxf>) {
    courierCadFontPromise ??= (async () => {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${baseUrl}assets/fonts/CourierCad.cxf`);
        if (!response.ok)
            throw new Error('Could not load the CourierCad font.');
        return parseCxf(await response.text());
    })();
    const font = await courierCadFontPromise;

    return entities.map((entity) => {
        if (entity.type !== 'CAD_TEXT') return entity;
        const strokes = cxfTextStrokes(String(entity.text || ''), font, {
            x: entity.x,
            y: entity.y,
            height: entity.height || 1,
            rotationDeg: entity.rotationDeg || 0,
            lineSpacingFactor: entity.lineSpacingFactor || 1,
            attachmentPoint: entity.attachmentPoint || 1,
        });
        return { ...entity, strokes, __cadTextMode: 'stroke' };
    });
}

/** Apply the source-to-mm conversion to all imported vector coordinates. */
export function scaleImportResult(
    result: ImportResult,
    scale: number,
): ImportResult {
    const loops = result.loops.map((loop) => ({
        ...loop,
        points: loop.points.map((point) => ({
            x: point.x * scale,
            y: point.y * scale,
        })),
    }));
    const bounds = result.bounds
        ? {
              minX: result.bounds.minX * scale,
              minY: result.bounds.minY * scale,
              maxX: result.bounds.maxX * scale,
              maxY: result.bounds.maxY * scale,
          }
        : null;
    const bitmaps = result.bitmaps?.map((bitmap) => ({
        ...bitmap,
        x: bitmap.x * scale,
        y: bitmap.y * scale,
        w: bitmap.w * scale,
        h: bitmap.h * scale,
    }));
    return {
        ...result,
        loops,
        bounds,
        ...(bitmaps ? { bitmaps } : {}),
        unitScaleToMm: scale,
    };
}
