/**
 * Purpose: Application composition module for AppModalLayer.
 */
import type {
    ComponentProps,
    Dispatch,
    ReactNode,
    SetStateAction,
} from 'react';
import { ToastStack } from '../components/Toasts';
import { TraceModal } from '../components/TraceModal';
import { type ViewLoop } from '../canvas/types';
import {
    type BitmapImportChoice,
    type PlacedBitmapRecord,
} from '../document/useBitmapCommands';
import { type UnitSystem } from '../lib/units';
import { type PlacedTrace } from '../lib/trace';
import { VectorUnitsModal } from '../document/VectorUnitsModal';
import { SurfaceUnitsModal } from '../document/SurfaceUnitsModal';
import type { VectorUnitImportChoice } from '../document/useVectorImport';
import type { SurfaceUnitImportChoice } from '../document/useBitmapCommands';
import { ModalLayer } from './ModalLayer';
import { MachineSetupModal } from './MachineSetupModal';
import type { MachineTravelLimits } from '../cutting-parameters/types';

type Point = { x: number; y: number };

interface AppModalLayerProps {
    units: UnitSystem;
    machineSetupOpen: boolean;
    machineProfileId: string;
    onChooseMachine(
        profileId: string,
        limits: MachineTravelLimits,
        units: UnitSystem,
    ): void;
    textAnchor: Point | null;
    drawText: string;
    drawFont: string;
    drawTextHeight: number;
    setDrawText: Dispatch<SetStateAction<string>>;
    setDrawFont: Dispatch<SetStateAction<string>>;
    setDrawTextHeight: Dispatch<SetStateAction<number>>;
    onCommitText(anchor: Point): Promise<void>;
    setTextAnchor: Dispatch<SetStateAction<Point | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
    toasts: ComponentProps<typeof ToastStack>['toasts'];
    dismissToast: ComponentProps<typeof ToastStack>['onDismiss'];
    confirmation: ReactNode;
    bitmapImportChoice: BitmapImportChoice<ViewLoop> | null;
    commitBitmapPlacement(choice: BitmapImportChoice<ViewLoop>): void;
    updateSurfaceSetupOrientation(
        choice: BitmapImportChoice<ViewLoop>,
        machineUp: [number, number, number],
    ): Promise<void>;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
    setPendingTraceBitmap: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
    traceOpen: boolean;
    setTraceOpen: Dispatch<SetStateAction<boolean>>;
    traceSource: PlacedBitmapRecord | null;
    fileName: string;
    commitTraced(traced: PlacedTrace[], replaceBitmapId?: string): void;
    vectorUnitImportChoice: VectorUnitImportChoice | null;
    resolveVectorUnits(scaleToMm: number): void;
    cancelVectorUnits(): void;
    surfaceUnitImportChoice: SurfaceUnitImportChoice | null;
    resolveSurfaceModelUnits(units: 'mm' | 'inch'): void;
    cancelSurfaceModelUnits(): void;
    onImportRotaryModel?(file: File, units: 'mm' | 'inch'): void;
}

/** Binds document commands to the shared transient-dialog layer. */
export function AppModalLayer({
    units,
    machineSetupOpen,
    machineProfileId,
    onChooseMachine,
    textAnchor,
    drawText,
    drawFont,
    drawTextHeight,
    setDrawText,
    setDrawFont,
    setDrawTextHeight,
    onCommitText,
    setTextAnchor,
    setStatus,
    toasts,
    dismissToast,
    confirmation,
    bitmapImportChoice,
    commitBitmapPlacement,
    updateSurfaceSetupOrientation,
    setBitmapImportChoice,
    setPendingTraceBitmap,
    traceOpen,
    setTraceOpen,
    traceSource,
    fileName,
    commitTraced,
    vectorUnitImportChoice,
    resolveVectorUnits,
    cancelVectorUnits,
    surfaceUnitImportChoice,
    resolveSurfaceModelUnits,
    cancelSurfaceModelUnits,
    onImportRotaryModel,
}: AppModalLayerProps) {
    const traceImage = traceSource?.img ?? null;
    return (
        <>
            <ModalLayer
                text={{
                    open: textAnchor !== null,
                    props: {
                        units,
                        text: drawText,
                        font: drawFont,
                        heightMm: drawTextHeight,
                        onTextChange: setDrawText,
                        onFontChange: setDrawFont,
                        onHeightChange: setDrawTextHeight,
                        onSubmit: async () => {
                            if (!textAnchor) return;
                            try {
                                await onCommitText(textAnchor);
                                setTextAnchor(null);
                            } catch (error) {
                                setStatus(
                                    error instanceof Error
                                        ? error.message
                                        : 'Could not add text.',
                                );
                            }
                        },
                    },
                    onClose: () => setTextAnchor(null),
                }}
                toast={<ToastStack toasts={toasts} onDismiss={dismissToast} />}
                confirmation={confirmation}
                bitmap={
                    bitmapImportChoice
                        ? {
                              choice: {
                                  ...bitmapImportChoice,
                                  isSurfaceModel: Boolean(
                                      bitmapImportChoice.entry.surfaceMesh,
                                  ),
                                  surfaceMachinableTopDown:
                                      bitmapImportChoice.entry
                                          .surfaceMachinableTopDown,
                                  surfacePreviewUrl:
                                      bitmapImportChoice.entry.dataUrl,
                                  machineUp:
                                      bitmapImportChoice.entry.surfaceMesh
                                          ?.machineUp,
                              },
                              onSetupOrientation: (machineUp) =>
                                  updateSurfaceSetupOrientation(
                                      bitmapImportChoice,
                                      machineUp,
                                  ),
                              onUseBitmap: () => {
                                  commitBitmapPlacement(bitmapImportChoice);
                                  setBitmapImportChoice(null);
                              },
                              onTrace: () => {
                                  setPendingTraceBitmap(bitmapImportChoice);
                                  setBitmapImportChoice(null);
                                  setTraceOpen(true);
                              },
                              onCancel: () => setBitmapImportChoice(null),
                          }
                        : null
                }
                trace={{
                    open: traceOpen,
                    props:
                        traceImage && traceSource
                            ? {
                                  fileName: fileName || 'bitmap',
                                  img: traceImage,
                                  originX: traceSource.x,
                                  originY: traceSource.y,
                                  widthMm: traceSource.w,
                                  heightMm: traceSource.h,
                                  onClose: () => {
                                      setTraceOpen(false);
                                      setPendingTraceBitmap(null);
                                  },
                                  onImport: (traced) => {
                                      setTraceOpen(false);
                                      commitTraced(traced, traceSource.id);
                                      setPendingTraceBitmap(null);
                                  },
                              }
                            : null,
                }}
            />
            {machineSetupOpen && (
                <MachineSetupModal
                    units={units}
                    machineProfileId={machineProfileId}
                    onChoose={onChooseMachine}
                />
            )}
            {vectorUnitImportChoice && (
                <VectorUnitsModal
                    key={vectorUnitImportChoice.file.name}
                    fileName={vectorUnitImportChoice.file.name}
                    fileType={
                        vectorUnitImportChoice.file.name
                            .toLowerCase()
                            .endsWith('.svg')
                            ? 'SVG'
                            : 'DXF'
                    }
                    width={
                        (vectorUnitImportChoice.result.bounds?.maxX ?? 0) -
                        (vectorUnitImportChoice.result.bounds?.minX ?? 0)
                    }
                    height={
                        (vectorUnitImportChoice.result.bounds?.maxY ?? 0) -
                        (vectorUnitImportChoice.result.bounds?.minY ?? 0)
                    }
                    onApply={resolveVectorUnits}
                    onCancel={cancelVectorUnits}
                />
            )}
            {surfaceUnitImportChoice && (
                <SurfaceUnitsModal
                    key={surfaceUnitImportChoice.file.name}
                    fileName={surfaceUnitImportChoice.file.name}
                    sizeMm={surfaceUnitImportChoice.sizeMm}
                    onApply={resolveSurfaceModelUnits}
                    onCancel={cancelSurfaceModelUnits}
                    onRotary={
                        onImportRotaryModel &&
                        /\.stl$/i.test(surfaceUnitImportChoice.file.name)
                            ? (units) =>
                                  onImportRotaryModel(
                                      surfaceUnitImportChoice.file,
                                      units,
                                  )
                            : undefined
                    }
                />
            )}
        </>
    );
}
