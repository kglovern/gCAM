import { validateLaserRotary, laserRotaryScale } from '../cam/laser-rotary.js';
import { buildGcode } from '../cam/cam-ops.js';
import type { UnitSystem } from '../lib/units';
import { DEFAULT_OUTPUT, type OutputSettings } from './profiles';
import { renderProgram } from './renderProgram';
import { validateFocusProgram } from './focusProgram';
import {
    scanAlignmentApplies,
    scanAlignmentOffset,
} from '../cam/scan-alignment.js';

export function exportToolpaths(
    toolpaths: Record<string, unknown>[],
    fileName: string,
    arcs: boolean,
    units: UnitSystem,
    settings: OutputSettings = DEFAULT_OUTPUT,
): string {
    if (!toolpaths.length) return '';
    const laser = toolpaths.some((path) =>
        String(path.operation).startsWith('laser'),
    );
    if (
        laser &&
        toolpaths.some((path) => !String(path.operation).startsWith('laser'))
    )
        throw new Error('Export laser and milling toolpaths separately.');
    const rotarySetups = toolpaths.map((path) =>
        validateLaserRotary(path.laserRotary),
    );
    if (
        rotarySetups.some(Boolean) &&
        rotarySetups.some(
            (setup) =>
                JSON.stringify(setup) !== JSON.stringify(rotarySetups[0]),
        )
    )
        throw new Error(
            'Use one laser rotary setup for the entire exported job.',
        );
    for (const path of toolpaths) {
        const focus = path.laserFocusTest as
            | { mode?: string; stepMm?: number }
            | undefined;
        if (focus?.mode === 'sweep') {
            const quantum = Math.max(
                0.0001,
                10 ** -settings.decimals * (units === 'imperial' ? 25.4 : 1),
            );
            if (!(Number(focus.stepMm) >= quantum * 4))
                throw new Error(
                    'Focus steps need more coordinate precision in Config → G-code.',
                );
        }
        const rotary = validateLaserRotary(path.laserRotary);
        if (
            path.operation === 'laser-raster' &&
            (path.laserOptions as { passThrough?: boolean } | undefined)
                ?.passThrough
        ) {
            const quantum = rotary
                ? 10 ** -Math.min(4, settings.decimals) /
                  Math.abs(laserRotaryScale(rotary))
                : Math.max(
                      0.0001,
                      10 ** -settings.decimals *
                          (units === 'imperial' ? 25.4 : 1),
                  );
            if (
                !Number.isFinite(path.laserSpot) ||
                Number(path.laserSpot) <= 0 ||
                quantum > Number(path.laserSpot) / 2
            )
                throw new Error(
                    'Pixel pass-through needs more coordinate precision in Config → G-code.',
                );
        }
        const leadOptions = path.laserOptions as
            | { leadInLength?: number; leadOutLength?: number }
            | undefined;
        if (path.operation === 'laser-cut')
            for (const length of [
                leadOptions?.leadInLength ?? 0,
                leadOptions?.leadOutLength ?? 0,
            ])
                if (length > 0) {
                    const quantum = Math.max(
                        0.0001,
                        10 ** -settings.decimals *
                            (units === 'imperial' ? 25.4 : 1),
                        rotary
                            ? 10 ** -Math.min(4, settings.decimals) /
                                  Math.abs(laserRotaryScale(rotary))
                            : 0,
                    );
                    if (length < 4 * quantum)
                        throw new Error(
                            'Laser leads need more coordinate precision in Config → G-code.',
                        );
                }
        const overcut = Number(
            (path.laserOptions as { overcut?: number } | undefined)?.overcut ??
                0,
        );
        if (path.operation === 'laser-cut' && overcut > 0) {
            const quantum = Math.max(
                0.0001,
                10 ** -settings.decimals * (units === 'imperial' ? 25.4 : 1),
                rotary
                    ? 10 ** -Math.min(4, settings.decimals) /
                          Math.abs(laserRotaryScale(rotary))
                    : 0,
            );
            if (overcut < quantum * 4)
                throw new Error(
                    'Laser overcut needs more coordinate precision in Config → G-code.',
                );
        }
        const perforation = path.laserOptions as
            | {
                  perforation?: boolean;
                  perforationCut?: number;
                  perforationSkip?: number;
              }
            | undefined;
        if (path.operation === 'laser-cut' && perforation?.perforation) {
            const quantum = Math.max(
                0.0001,
                10 ** -settings.decimals * (units === 'imperial' ? 25.4 : 1),
                rotary
                    ? 10 ** -Math.min(4, settings.decimals) /
                          Math.abs(laserRotaryScale(rotary))
                    : 0,
            );
            if (
                !(
                    Math.min(
                        Number(perforation.perforationCut),
                        Number(perforation.perforationSkip),
                    ) >=
                    quantum * 4
                )
            )
                throw new Error(
                    'Perforation needs more coordinate precision in Config → G-code.',
                );
        }
        const bridgeOptions = path.laserOptions as
            | {
                  bridges?: boolean;
                  bridgeWidth?: number;
                  bridgeMode?: 'automatic' | 'manual';
              }
            | undefined;
        const hasManualBridges =
            Array.isArray(path.laserManualTabs) &&
            path.laserManualTabs.length > 0;
        if (
            path.operation === 'laser-cut' &&
            ((bridgeOptions?.bridgeMode === undefined && hasManualBridges) ||
                (bridgeOptions?.bridges &&
                    (bridgeOptions.bridgeMode !== 'manual' ||
                        hasManualBridges)))
        ) {
            const quantum = Math.max(
                0.0001,
                10 ** -settings.decimals * (units === 'imperial' ? 25.4 : 1),
                rotary
                    ? 10 ** -Math.min(4, settings.decimals) /
                          Math.abs(laserRotaryScale(rotary))
                    : 0,
            );
            if (!(Number(bridgeOptions?.bridgeWidth ?? 0.5) >= quantum * 4))
                throw new Error(
                    'Holding bridges need more coordinate precision in Config → G-code.',
                );
        }
        const dotWidth =
            Number(
                (
                    path.laserOptions as
                        | { dotWidthCorrection?: number }
                        | undefined
                )?.dotWidthCorrection,
            ) || 0;
        if (path.operation === 'laser-raster' && dotWidth > 0) {
            const quantum = rotary
                ? 10 ** -Math.min(4, settings.decimals) /
                  Math.abs(laserRotaryScale(rotary))
                : Math.max(
                      0.0001,
                      10 ** -settings.decimals *
                          (units === 'imperial' ? 25.4 : 1),
                  );
            if (quantum > Math.min(0.01, dotWidth) / 2)
                throw new Error(
                    'Dot-width correction needs more coordinate precision in Config → G-code.',
                );
        }
        const aligned = scanAlignmentApplies(path.operation, path.laserOptions);
        if (rotary && aligned)
            throw new Error(
                'Scan alignment calibration is for flat laser jobs. Disable it before rotary export.',
            );
        if (aligned) {
            const quantum = Math.max(
                0.0001,
                10 ** -settings.decimals * (units === 'imperial' ? 25.4 : 1),
            );
            const feeds = new Set([
                Number(path.laserFeed),
                ...(Array.isArray(path.laserPaths)
                    ? path.laserPaths.map((p) =>
                          Number(p.feed ?? path.laserFeed),
                      )
                    : []),
            ]);
            for (const feed of feeds) {
                const offset = Math.abs(
                    scanAlignmentOffset(
                        (path.laserOptions as { scanAlignment: unknown })
                            .scanAlignment,
                        feed,
                    ),
                );
                if (offset && quantum > Math.min(0.01, offset) / 2)
                    throw new Error(
                        'Scan alignment needs more coordinate precision than this exporter/profile provides.',
                    );
            }
        }
        if (!rotary) continue;
        const surfaceQuantum =
            10 ** -Math.min(4, settings.decimals) /
            Math.abs(laserRotaryScale(rotary));
        if (surfaceQuantum > Math.min(0.01, Number(path.laserSpot) || 0.1) / 2)
            throw new Error(
                'Rotary calibration requires more coordinate precision than this output profile provides.',
            );
        if (!rotary.confirmed)
            throw new Error(
                'Check the rotary calibration in Job stock before exporting.',
            );
        if (!String(path.operation).startsWith('laser-') || !path.laserPaths)
            throw new Error('Laser rotary requires a generated laser path.');
        if (rotary.axis === 'A' && settings.controller !== 'grblhal')
            throw new Error(
                'Dedicated A-axis laser output currently requires grblHAL with an independent rotary axis.',
            );
        if (rotary.axis === 'A' && units !== 'metric')
            throw new Error(
                'Select metric output for dedicated A-axis laser rotary.',
            );
    }
    const program = renderProgram(
        buildGcode({
            toolpaths: toolpaths as never,
            fileName,
            forcePolylineArcs: !(arcs && settings.arcs),
        }),
        settings,
        units,
        {
            fileName,
            laser,
            operations: toolpaths.map((path) => ({
                marker: `(${path.operationLabel} - ${path.label})`,
                name: String(path.operationLabel || path.label || ''),
                values: {
                    laserPowerMode: String(
                        (
                            path.laserOptions as
                                | { powerMode?: string }
                                | undefined
                        )?.powerMode ?? 'profile',
                    ),
                    toolNumber: Number(path.toolNumber) || 1,
                    toolName: String(path.libraryToolName || ''),
                    toolDiameter: Number(path.toolDiameter),
                    feedRate: Number(path.feedRate),
                    plungeRate: Number(path.plungeRate),
                    safeZ: Number(path.safeZ),
                    spindleSpeed: Number(path.spindle),
                },
            })),
        },
    );
    validateFocusProgram(program, toolpaths, settings);
    return program;
}
