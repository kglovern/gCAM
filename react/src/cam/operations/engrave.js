/**
 * Purpose: Implementation module for engrave in the cam domain.
 */
import { defineOperation } from './contract.js';
import { edgeChamferDimensions } from '../chamfer.js';

function directContourOperation(id) {
    return defineOperation({
        id,
        createPreview({ selectedLoops, services }) {
            return selectedLoops
                .filter((loop) => loop.points)
                .map((loop) => loop.points.map(services.clonePoint));
        },
        emission: id === 'laser-cut' ? 'laser-cut' : 'contours',
    });
}

export const engraveOperation = directContourOperation('engrave');
export const chamferOperation = defineOperation({
    id: 'chamfer',
    createPreview({
        selectedLoops,
        compositeSelection,
        config = {},
        services,
    }) {
        if (config.chamferWidthMm === undefined)
            return selectedLoops
                .filter((loop) => loop.points)
                .map((loop) => loop.points.map(services.clonePoint));
        if (
            selectedLoops.some(
                (loop) =>
                    !Array.isArray(loop.points) ||
                    loop.points.length < 4 ||
                    Math.hypot(
                        loop.points[0].x -
                            loop.points[loop.points.length - 1].x,
                        loop.points[0].y -
                            loop.points[loop.points.length - 1].y,
                    ) > 1e-7,
            )
        )
            throw new Error(
                'Edge chamfer needs closed outlines. Use Engrave for open V-groove lines.',
            );
        const { offset } = edgeChamferDimensions(
            config.chamferWidthMm,
            config.chamferTipOffsetMm ?? 0,
            config.cutterAngle,
            config.toolDiameter,
        );
        const paths = services.offsetCompositePolygons(
            compositeSelection,
            offset,
            1e-8,
        );
        if (!paths.length || paths.length !== compositeSelection.length)
            throw new Error(
                'Tip offset closes a hole or joins separate edges. Reduce the tip offset.',
            );
        return paths;
    },
    emission: 'contours',
});
export const laserCutOperation = directContourOperation('laser-cut');
