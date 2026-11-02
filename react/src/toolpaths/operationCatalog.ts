/**
 * Purpose: Implementation module for operationCatalog in the react domain.
 */
import type { Operation } from '../lib/engine';

export const OPERATIONS: { value: Operation; label: string }[] = [
    { value: 'profile-outside', label: 'Outside' },
    { value: 'profile-inside', label: 'Inside' },
    { value: 'pocket', label: 'Pocket' },
    { value: 'engrave', label: 'Engrave' },
    { value: 'chamfer', label: 'Chamfer' },
    { value: 'vcarve', label: 'V-Carve' },
    { value: 'countersink', label: 'V-Bit Countersink' },
    { value: 'texture-fill', label: 'Texture Fill' },
    { value: 'laser-fill', label: 'Laser Fill' },
    { value: 'laser-cut', label: 'Laser Cut' },
    { value: 'laser-raster', label: 'Laser Raster' },
    { value: 'wavy-raster', label: 'Wavy' },
    { value: 'halftone', label: 'Halftone' },
    { value: 'surface-clear', label: '3D Surface Clear' },
    { value: 'surface-finish', label: '3D Surface Finish' },
    { value: 'surface-waterline', label: '3D Waterline Finish' },
];

const operationAsset = (name: string) =>
    `${import.meta.env.BASE_URL}assets/operations/${name}.png`;
const operationSvgAsset = (name: string) =>
    `${import.meta.env.BASE_URL}assets/operations/${name}.svg`;

export const OPERATION_IMAGES: Partial<Record<Operation, string>> = {
    'profile-outside': operationAsset('outside'),
    'profile-inside': operationAsset('inside'),
    pocket: operationAsset('pocket'),
    engrave: operationAsset('engrave'),
    chamfer: operationAsset('chamfer'),
    vcarve: operationAsset('vcarve'),
    countersink: operationSvgAsset('countersink'),
    'texture-fill': operationAsset('texture-fill'),
    'laser-fill': operationAsset('pocket'),
    'laser-cut': operationAsset('engrave'),
    'laser-raster': operationAsset('engrave'),
    'wavy-raster': operationAsset('pocket'),
    halftone: operationAsset('pocket'),
    'surface-clear': operationSvgAsset('surface-clear'),
    'surface-finish': operationSvgAsset('surface-finish'),
    'surface-waterline': operationSvgAsset('surface-waterline'),
};

export const RASTER_OPERATIONS: Operation[] = [
    'laser-raster',
    'wavy-raster',
    'halftone',
];

export const isLaserOperation = (operation: string) =>
    operation.startsWith('laser-');

export function operationsForSelection(selection: {
    workspace?: 'milling' | 'laser';
    hasBitmap: boolean;
    hasVector: boolean;
    hasSurfaceModel: boolean;
    surfaceModelSelectedAlone: boolean;
}) {
    return OPERATIONS.filter((operation) => {
        if (
            selection.workspace &&
            isLaserOperation(operation.value) !==
                (selection.workspace === 'laser')
        )
            return false;
        const raster = RASTER_OPERATIONS.includes(operation.value);
        const surface =
            operation.value === 'surface-clear' ||
            operation.value === 'surface-finish' ||
            operation.value === 'surface-waterline';
        if (selection.hasSurfaceModel && !selection.hasVector)
            return (
                selection.surfaceModelSelectedAlone &&
                (surface || operation.value === 'profile-outside')
            );
        if (
            selection.workspace === 'laser' &&
            selection.hasBitmap &&
            selection.hasVector &&
            !selection.hasSurfaceModel
        )
            return true;
        if (selection.hasBitmap && !selection.hasVector) return raster;
        if (selection.hasVector) return !raster && !surface;
        return true;
    });
}
