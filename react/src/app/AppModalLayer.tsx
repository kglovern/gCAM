/**
 * Purpose: Application composition module for AppModalLayer.
 */
import type {
    ComponentProps,
    Dispatch,
    ReactNode,
    SetStateAction,
} from 'react';
import { useRef } from 'react';
import { imageDataOf } from '../lib/bitmap';
import { bitmapHeightmapInWorker } from '../engine/cam-worker-client';
import { jobStockBounds, type JobStock } from '../job/stock';
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
    stock?: JobStock;
    laser?: boolean;
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
}

/** Binds document commands to the shared transient-dialog layer. */
export function AppModalLayer({
    stock,
    laser,
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
}: AppModalLayerProps) {
    const heightmapSource = useRef({
        choice: bitmapImportChoice,
        laser,
        stock,
    });
    heightmapSource.current = { choice: bitmapImportChoice, laser, stock };
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
                              units,
                              choice: {
                                  ...bitmapImportChoice,
                                  laser,
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
                              onUseHeightmap: async (
                                  reliefMm,
                                  spacingMm,
                                  invert,
                                  signal,
                              ) => {
                                  const choice = bitmapImportChoice;
                                  const img = choice.entry.img;
                                  if (
                                      !img ||
                                      img.naturalWidth * img.naturalHeight >
                                          16_000_000
                                  )
                                      throw new Error(
                                          'Heightmap images must contain at most 16 million pixels.',
                                      );
                                  const pixels = imageDataOf(img);
                                  const { promise } = bitmapHeightmapInWorker(
                                      {
                                          image: {
                                              width: pixels.width,
                                              height: pixels.height,
                                              data: pixels.data,
                                          },
                                          widthMm: choice.entry.w,
                                          heightMm: choice.entry.h,
                                          reliefMm,
                                          spacingMm,
                                          invert,
                                          fileName: choice.fileName,
                                      },
                                      signal,
                                  );
                                  const surfaceMesh = await promise;
                                  if (
                                      signal.aborted ||
                                      heightmapSource.current.choice !==
                                          choice ||
                                      heightmapSource.current.laser ||
                                      heightmapSource.current.stock !== stock
                                  )
                                      throw new DOMException(
                                          'Heightmap import cancelled.',
                                          'AbortError',
                                      );
                                  const bounds = stock
                                      ? jobStockBounds(stock)
                                      : null;
                                  const x = bounds
                                      ? (bounds.minX +
                                            bounds.maxX -
                                            choice.entry.w) /
                                        2
                                      : choice.entry.x;
                                  const y = bounds
                                      ? (bounds.minY +
                                            bounds.maxY -
                                            choice.entry.h) /
                                        2
                                      : choice.entry.y;
                                  commitBitmapPlacement({
                                      ...choice,
                                      rect: {
                                          ...choice.rect,
                                          points: choice.rect.points.map(
                                              (point) => ({
                                                  x:
                                                      point.x +
                                                      x -
                                                      choice.entry.x,
                                                  y:
                                                      point.y +
                                                      y -
                                                      choice.entry.y,
                                              }),
                                          ),
                                      },
                                      entry: {
                                          ...choice.entry,
                                          x,
                                          y,
                                          surfaceMesh,
                                          surfaceMachinableTopDown: true,
                                      },
                                  });
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
                                  rotation: traceSource.rotation ?? 0,
                                  onClose: () => {
                                      setTraceOpen(false);
                                      setPendingTraceBitmap(null);
                                  },
                                  onImport: (traced, deleteImage) => {
                                      setTraceOpen(false);
                                      commitTraced(
                                          traced,
                                          deleteImage
                                              ? traceSource.id
                                              : undefined,
                                      );
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
                />
            )}
        </>
    );
}
