import { resolveLinkedImageMask } from '../lib/image-mask';
import { createDocumentId } from '../lib/ids';
import { edgeChamferDimensions } from '../cam/chamfer.js';
import { ChamferFields } from './ChamferFields';
import { expandGroupedSelection } from '../lib/groups';
import { LaserImageFlatten } from './LaserImageFlatten';
import type { FlattenImageCommit } from '../lib/flatten-image-document';
import type { LaserSettingsSource } from './copy-laser-settings';
import { LaserImageExport } from './LaserImageExport';
import { RasterRegionFields } from './RasterRegionFields';
import { LaserRasterPreview } from './LaserRasterPreview';
import { LaserSettingsFields } from './LaserSettingsFields';
import type { LaserOptions } from './toolpathRequest';
import { jobStockBounds } from '../job/stock';
/**
 * Purpose: Implementation module for ToolpathPanel in the react domain.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_MACHINE_PROFILE,
    machineProfileById,
} from '../cutting-parameters/machines';
import { recommendCuttingParameters } from '../cutting-parameters/recommend';
import { MATERIAL_RECIPES } from '../cutting-parameters/recipes';
import type {
    MachineTravelLimits,
    MaterialId,
    RotaryOperation,
} from '../cutting-parameters/types';
import type { ViewLoop } from '../canvas/types';
import {
    buildToolpathGcode,
    buildToolpathGcodeAsync,
    buildSurfaceToolpathResult,
    type Operation,
    type PlacedTab,
    type ProfileArgs,
    type RasterBitmap,
    type ToolpathResult,
} from '../lib/engine';
import { imageDataOf } from '../lib/bitmap';
import { UnitInput } from '../components/UnitInput';
import { isConfigured, loadSlots, type ToolSlot } from '../tools/library';
import { displayValue, type UnitSystem } from '../lib/units';
import { operationsForSelection } from './operationCatalog';
import { ToolpathOperationPicker } from './ToolpathOperationPicker';
import { TextureFields } from './TextureFields';
import { CuttingFields } from './CuttingFields';
import { RasterLaserFields } from './RasterLaserFields';
import { VBitRasterFields } from './VBitRasterFields';
import { ToolSelectionFields } from './ToolSelectionFields';
import { ToolpathFormAlerts } from './ToolpathFormAlerts';
import { ToolpathSubmitControls } from './ToolpathSubmitControls';
import { ToolpathEmptyState } from './ToolpathEmptyState';
import { CuttingRecipeFields } from './CuttingRecipeFields';
import type { JobStock } from '../job/stock';
import { generateSurfaceCamPaths } from '../engine/surface-cam-runner';
import { transformStoredSurfaceMesh } from '../engine/surface-model';
import { SurfaceCamFields } from './SurfaceCamFields';
import { getPaths, traceCanvas } from '../engine/potrace-js/index.js';
import { flattenTracedPaths } from '../lib/trace';

type DraftContour = { x: number; y: number }[] & {
    _intensity?: number;
    _laserPower?: number;
    _laserVariablePower?: boolean;
    _laserInterval?: number;
    _solidPreview?: boolean;
};

function canvasDraftContours(
    contours: { x: number; y: number }[][],
    solid: boolean,
): DraftContour[] {
    if (!solid) return contours;
    return contours.map((points) =>
        Object.assign([...points], {
            _intensity: (points as DraftContour)._intensity,
            _laserPower: (points as DraftContour)._laserPower,
            _laserVariablePower: (points as DraftContour)._laserVariablePower,
            _laserInterval: (points as DraftContour)._laserInterval,
            _solidPreview: true,
        }),
    );
}

/** Trace the transparent footprint of an STL heightmap into a movable profile contour. */
function surfaceFootprintLoops(bitmap: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    img?: HTMLImageElement;
}): ViewLoop[] {
    if (!bitmap.img || bitmap.w <= 0 || bitmap.h <= 0)
        throw new Error(
            'Could not trace the STL footprint. Re-import the model and try again.',
        );
    const width = bitmap.img.naturalWidth;
    const height = bitmap.img.naturalHeight;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext)
        throw new Error('Canvas is unavailable for tracing the STL footprint.');
    sourceContext.drawImage(bitmap.img, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const covered = pixels.data[i + 3] >= 32;
        const value = covered ? 0 : 255;
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
    }
    sourceContext.putImageData(pixels, 0, 0);
    const pixelLoops = flattenTracedPaths(
        getPaths(traceCanvas(source, { turdsize: 4, opttolerance: 0.15 })),
    );
    const radians = ((bitmap.rotation ?? 0) * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = bitmap.x + bitmap.w / 2;
    const centerY = bitmap.y + bitmap.h / 2;
    const loops = pixelLoops.map((points, index) => ({
        id: `${bitmap.id}-profile-${index}`,
        points: points.map((point) => {
            const x = bitmap.x + (point.x / width) * bitmap.w;
            const y = bitmap.y + bitmap.h - (point.y / height) * bitmap.h;
            const dx = x - centerX;
            const dy = y - centerY;
            return {
                x: centerX + dx * cosine - dy * sine,
                y: centerY + dx * sine + dy * cosine,
            };
        }),
    }));
    if (!loops.length)
        throw new Error('No STL footprint was found to profile.');
    return loops;
}

export const ToolpathPanel = memo(function ToolpathPanel({
    workspace,
    laserSettingsSources,
    loops,
    selected,
    bitmaps,
    submitLabel,
    onResult,
    defaultArcs = true,
    onDraftPreview,
    onDraftProgress,
    editEntry = null,
    onUpdate,
    onCancelEdit,
    units = 'metric',
    machineProfileId = 'longmill-router',
    machineTravelLimits,
    stock,
    onStockThickness,
    onFitSurface,
    onFlattenImage,
    onMaskLink,
}: {
    onMaskLink?: (id: string, ids?: string[]) => void;
    onFlattenImage?: (value: FlattenImageCommit) => void;
    workspace?: 'milling' | 'laser';
    laserSettingsSources?: LaserSettingsSource[];
    loops: ViewLoop[];
    selected: string[];
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        img?: HTMLImageElement;
        dataUrl?: string;
        maskSourceIds?: string[];
        rotation?: number;
        surfaceMesh?: import('../engine/surface-model').StoredSurfaceMesh;
        surfaceMachinableTopDown?: boolean;
    }[];
    submitLabel: string;
    onResult: (r: ToolpathResult, args: ProfileArgs) => void;
    defaultArcs?: boolean;
    onDraftPreview?: (contours: { x: number; y: number }[][] | null) => void;
    onDraftProgress?: (
        progress: { percent: number; label: string } | null,
    ) => void;
    editEntry?: {
        id: string;
        args: ProfileArgs;
        loops: ViewLoop[];
    } | null;
    onUpdate?: (id: string, r: ToolpathResult, args: ProfileArgs) => void;
    onCancelEdit?: () => void;
    units?: UnitSystem;
    machineProfileId?: string;
    machineTravelLimits: MachineTravelLimits;
    stock: JobStock;
    onStockThickness?: (value: number) => void;
    onFitSurface?: (id: string, mode: 'uniform' | 'z') => void;
}) {
    const [flattening, setFlattening] = useState(false);
    const [operation, setOperation] = useState<Operation>(
        workspace === 'laser' ? 'laser-cut' : 'profile-outside',
    );
    const [toolDiameter, setToolDiameter] = useState(6);
    const [cutDepth, setCutDepth] = useState(stock.thicknessMm);
    const [clearingEnabled, setClearingEnabled] = useState(false);
    const [clearingSlot, setClearingSlot] = useState(0);
    const [chamferWidth, setChamferWidth] = useState<number | null>(0.5);
    const [chamferTipOffset, setChamferTipOffset] = useState(0.25);
    const [countersinkHeadDiameter, setCountersinkHeadDiameter] = useState(8);
    const [autoCutDepth, setAutoCutDepth] = useState(true);
    const [trochoid, setTrochoid] = useState(false);
    const [engagement, setEngagement] = useState(10);
    const [helicalEntry, setHelicalEntry] = useState(false);
    const [laserFeed, setLaserFeed] = useState(3000);
    const [laserPower, setLaserPower] = useState(1000);
    const [laserSpot, setLaserSpot] = useState(0.2);
    const [laserGamma, setLaserGamma] = useState(1);
    const [laserSettingsReady, setLaserSettingsReady] = useState(false);
    const [storedLaserOptions, setLaserOptions] = useState<LaserOptions>({});
    const [laserOverscan, setLaserOverscan] = useState(2);
    const [wavySpacing, setWavySpacing] = useState(2);
    const [wavyShallow, setWavyShallow] = useState(0);
    const [wavyDeep, setWavyDeep] = useState(3);
    const [halftoneRes, setHalftoneRes] = useState(50);
    const [halftoneInvert, setHalftoneInvert] = useState(false);
    const [textureSpacing, setTextureSpacing] = useState(5);
    const [crosshatchAngle, setCrosshatchAngle] = useState(45);
    const [textureType, setTextureType] = useState<'voronoi' | 'crosshatch'>(
        'voronoi',
    );
    const [feedRate, setFeedRate] = useState(1800);
    const [plungeRate, setPlungeRate] = useState(600);
    const [spindle, setSpindle] = useState(18000);
    const [safeZ, setSafeZ] = useState(6);
    const [passDepth, setPassDepth] = useState(3);
    const [manualCuttingParams, setManualCuttingParams] = useState(false);
    const material: MaterialId = stock.material;
    const [arcs, setArcs] = useState(defaultArcs);
    const [toolNumber, setToolNumber] = useState(1);
    const [overlap, setOverlap] = useState(40);
    const [tabWidth, setTabWidth] = useState(9);
    const [tabHeight, setTabHeight] = useState(9);
    const [tabsEnabled, setTabsEnabled] = useState(true);
    const [surfaceResolution, setSurfaceResolution] = useState(0.25);
    const [surfaceStepover, setSurfaceStepover] = useState(1.2);
    const [surfaceStepdown, setSurfaceStepdown] = useState(1.5);
    const [surfaceAllowance, setSurfaceAllowance] = useState(0.35);
    const [surfaceBoundary, setSurfaceBoundary] = useState(0);
    const [surfaceBoundaryMode, setSurfaceBoundaryMode] = useState<
        'model' | 'rectangle'
    >('model');
    const [autoTabHeight, setAutoTabHeight] = useState(true);
    const [laserSMin, setLaserSMin] = useState(0);
    const [laserSMax, setLaserSMax] = useState(1000);
    const [wavyFeed, setWavyFeed] = useState(1800);
    const [slots, setSlots] = useState<ToolSlot[]>(() =>
        typeof window === 'undefined' ? [] : loadSlots(window.localStorage),
    );
    const [slotNum, setSlotNum] = useState(1);
    const [toolLibOpen, setToolLibOpen] = useState(false);
    const [toolLibSlot, setToolLibSlot] = useState<number | null>(null);
    const surfaceAbortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setArcs(defaultArcs);
    }, [defaultArcs]);

    const applySlot = (slot: ToolSlot) => {
        if (slot.cuttingDiameterMm != null)
            setToolDiameter(slot.cuttingDiameterMm);
        setToolNumber(slot.slot);
    };
    const activeSlot = slots.find((s) => s.slot === slotNum) ?? null;
    const machine =
        machineProfileById(machineProfileId) ?? DEFAULT_MACHINE_PROFILE;
    const recipeOperation: RotaryOperation | null =
        operation === 'surface-clear' ||
        operation === 'surface-finish' ||
        operation === 'surface-waterline' ||
        operation === 'wavy-raster' ||
        operation === 'halftone' ||
        operation === 'chamfer' ||
        operation === 'countersink'
            ? 'engrave'
            : operation === 'laser-cut' ||
                operation === 'laser-raster' ||
                operation === 'laser-fill'
              ? null
              : operation;
    const recommendation = (() => {
        if (!activeSlot || !recipeOperation) return null;
        if (!(activeSlot.cuttingDiameterMm && activeSlot.flutes)) return null;
        try {
            return recommendCuttingParameters({
                material,
                machine,
                operation: recipeOperation,
                stockDepthMm: stock.thicknessMm,
                cutter: {
                    toolType: activeSlot.toolType,
                    diameterMm: activeSlot.cuttingDiameterMm,
                    flutes: activeSlot.flutes,
                    cuttingLengthMm: activeSlot.cuttingLengthMm,
                    cutterMaterial: activeSlot.cutterMaterial ?? undefined,
                    fluteAngleDeg: activeSlot.fluteAngleDeg,
                },
            });
        } catch {
            return null;
        }
    })();
    const cutterAngle = activeSlot?.fluteAngleDeg ?? 90;
    const NEEDS_VBIT: Operation[] = [
        'vcarve',
        'countersink',
        'texture-fill',
        'chamfer',
        'wavy-raster',
        'halftone',
    ];
    const vbitMismatch =
        NEEDS_VBIT.includes(operation) && activeSlot?.toolType !== 'v-bit';
    const LASER_OPS: Operation[] = ['laser-cut', 'laser-raster', 'laser-fill'];
    const [busy, setBusy] = useState(false);
    const laserAbortControllerRef = useRef<AbortController | null>(null);
    const laserDraftControllerRef = useRef<AbortController | null>(null);
    const [laserBuildProgress, setLaserBuildProgress] = useState<
        number | undefined
    >();
    const [status, setStatus] = useState(
        loops.length ? 'Shapes ready.' : 'Import shapes first.',
    );
    // In edit mode the entry's own source loops drive it instead.
    const byId = new Map(loops.map((l) => [l.id, l]));
    const selectedLoops = expandGroupedSelection(loops, selected).flatMap(
        (id) => (byId.has(id) ? [byId.get(id)!] : []),
    );
    const selectionHasVector = selectedLoops.some((loop) => !loop.bitmapId);
    const selectionHasBitmap = selectedLoops.some((loop) =>
        Boolean(loop.bitmapId),
    );
    const surfaceSourceLoops = editEntry ? editEntry.loops : selectedLoops;
    const selectedSurfaceModel = surfaceSourceLoops
        .map((loop) =>
            bitmaps.find(
                (bitmap) => bitmap.id === loop.bitmapId && bitmap.surfaceMesh,
            ),
        )
        .find((bitmap) => Boolean(bitmap));
    const selectedSurfaceBitmap = editEntry
        ? selectedSurfaceModel
        : selectedLoops.length === 1
          ? selectedSurfaceModel
          : undefined;
    const placedSurfaceMesh = useMemo(
        () =>
            selectedSurfaceBitmap
                ? transformStoredSurfaceMesh(selectedSurfaceBitmap)
                : null,
        [selectedSurfaceBitmap],
    );
    const surfaceHeight = placedSurfaceMesh
        ? -placedSurfaceMesh.bounds.minZ
        : 0;
    useEffect(() => {
        if (selectedSurfaceBitmap && !busy)
            setStatus(
                '3D setup updated. Add a toolpath to calculate cutter compensation.',
            );
        // Clear obsolete generation errors when the model or stock changes.
        // Busy changes alone must retain the current build status.
    }, [
        selectedSurfaceBitmap,
        stock.thicknessMm,
        stock.origin,
        stock.widthMm,
        stock.heightMm,
    ]);
    // Mixed marquee selections operate on the vector geometry only. A 3D
    // model is machined individually, never combined with selected vectors.
    const active = editEntry
        ? editEntry.loops
        : selected.length > 0
          ? selectionHasVector && selectionHasBitmap
              ? selectedLoops.filter((loop) =>
                    operation === 'laser-raster'
                        ? Boolean(loop.bitmapId)
                        : !loop.bitmapId,
                )
              : selectedLoops
          : loops;

    const regionImageId = (editEntry?.loops ?? selectedLoops).find(
        (l) => l.bitmapId,
    )?.bitmapId;
    const regionImageRef = useRef(regionImageId);
    useEffect(() => {
        if (!editEntry && regionImageRef.current !== regionImageId)
            setLaserOptions((current) => ({
                ...current,
                imageCrop: { left: 0, bottom: 0, right: 1, top: 1 },
                imageMask: [],
            }));
        regionImageRef.current = regionImageId;
    }, [regionImageId, editEntry]);

    // Load a created toolpath back into the form for editing (legacy parity).
    const editId = editEntry?.id ?? null;
    useEffect(() => {
        if (!editEntry) {
            setClearingEnabled(false);
            setAutoCutDepth(true);
            setChamferWidth(0.5);
            setChamferTipOffset(0.25);
            setCutDepth(stock.thicknessMm);
            setManualCuttingParams(false);
            return;
        }
        const a = editEntry.args as ProfileArgs & Record<string, unknown>;
        setClearingEnabled(Boolean(a.vCarveClearingTool));
        setClearingSlot(a.vCarveClearingTool?.toolNumber ?? 0);
        const num = (v: unknown, fallback: number) =>
            typeof v === 'number' && Number.isFinite(v) ? v : fallback;
        setOperation(a.operation);
        setToolDiameter(num(a.toolDiameter, 6));
        setCutDepth(num(a.cutDepth, stock.thicknessMm));
        setChamferWidth(
            a.operation === 'chamfer' && a.chamferWidthMm === undefined
                ? null
                : num(a.chamferWidthMm, 0.5),
        );
        setChamferTipOffset(num(a.chamferTipOffsetMm, 0.25));
        setCountersinkHeadDiameter(num(a.countersinkHeadDiameterMm, 8));
        setAutoCutDepth(false);
        setTrochoid(Boolean(a.trochoidEnabled));
        setHelicalEntry(Boolean(a.helicalEntryEnabled));
        setEngagement(num(a.trochoidEngagementPercent, 10));
        setLaserFeed(num(a.laserFeed, 3000));
        setLaserPower(
            num(
                a.operation === 'laser-raster' ? a.laserSMax : a.laserPower,
                1000,
            ),
        );
        setLaserSpot(num(a.laserSpot, 0.2));
        setLaserSMin(num(a.laserSMin, 0));
        setLaserSMax(num(a.laserSMax, 1000));
        setLaserGamma(num(a.laserGamma, 1));
        setLaserOverscan(num(a.laserOverscan, 2));
        setLaserOptions({
            ...a.laserOptions,
            ...(a.operation === 'laser-cut' &&
            a.tabs?.length &&
            a.laserOptions?.bridgeMode === undefined
                ? { bridges: true, bridgeMode: 'manual' as const }
                : {}),
        });
        setWavySpacing(num(a.wavySpot, 2));
        setWavyShallow(num(a.wavyMinDepth, 0));
        setWavyDeep(num(a.wavyMaxDepth, 3));
        setWavyFeed(num(a.wavyFeed, 1800));
        setHalftoneRes(num(a.halftoneResolution, 50));
        setHalftoneInvert(Boolean(a.halftoneInvert));
        setTextureSpacing(num(a.textureSpacing, 5));
        setCrosshatchAngle(num(a.crosshatchAngle, 45));
        setTextureType(
            a.textureType === 'crosshatch' ? 'crosshatch' : 'voronoi',
        );
        setFeedRate(num(a.feedRate, 1800));
        setPlungeRate(num(a.plungeRate, 600));
        setSpindle(num(a.spindle, 18000));
        setManualCuttingParams(true);
        setSafeZ(num(a.safeZ, 5));
        setPassDepth(num(a.passDepth, num(a.cutDepth, stock.thicknessMm)));
        setArcs(a.arcs !== false);
        setToolNumber(Math.max(1, Math.round(num(a.toolNumber, 1))));
        setOverlap(num(a.overlapPercent, 40));
        setTabWidth(num(a.tabWidth, 9));
        setTabHeight(num(a.tabHeight, 9));
        setTabsEnabled(num(a.tabHeight, 9) > 0);
        setAutoTabHeight(false);
        setSurfaceResolution(num(a.surfaceResolutionMm, 0.25));
        setSurfaceStepover(num(a.surfaceStepoverMm, 1.2));
        setSurfaceStepdown(num(a.surfaceStepdownMm, 1.5));
        setSurfaceAllowance(num(a.surfaceStockToLeaveMm, 0.35));
        setSurfaceBoundary(num(a.surfaceBoundaryMm, 0));
        setSurfaceBoundaryMode(a.surfaceBoundaryMode ?? 'model');
        const slot = slots.find(
            (s) => s.slot === Math.max(1, Math.round(num(a.toolNumber, 1))),
        );
        if (slot) setSlotNum(slot.slot);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    useEffect(() => {
        if (!editEntry && autoCutDepth)
            setCutDepth(
                operation === 'pocket'
                    ? Math.min(3, stock.thicknessMm / 3)
                    : stock.thicknessMm,
            );
    }, [stock.thicknessMm, autoCutDepth, operation, editEntry]);

    // Only offer operations that fit the selection: bitmap ops need a
    // placed bitmap, vector ops need vector geometry.
    const hasBitmap = active.some((l) => l.bitmapId);
    const hasVector = active.some((l) => !l.bitmapId);
    const surfaceOperation =
        operation === 'surface-clear' ||
        operation === 'surface-finish' ||
        operation === 'surface-waterline';
    const effectiveFeedRate = manualCuttingParams
        ? feedRate
        : (recommendation?.feedMmMin ?? feedRate);
    const effectivePlungeRate = manualCuttingParams
        ? plungeRate
        : (recommendation?.plungeMmMin ?? plungeRate);
    const effectiveSpindle = manualCuttingParams
        ? spindle
        : (recommendation?.rpm ?? spindle);
    const effectivePassDepth = manualCuttingParams
        ? surfaceOperation
            ? surfaceStepdown
            : passDepth
        : (recommendation?.passDepthMm ?? passDepth);
    const isSurfaceLibraryTool = (slot: ToolSlot) =>
        isConfigured(slot) && Boolean(slot.libraryToolId);
    const compatibleSurfaceTools = slots.filter(
        (slot) =>
            isSurfaceLibraryTool(slot) &&
            (operation === 'surface-clear'
                ? slot.toolType === 'flat'
                : slot.toolType === 'ball' || slot.toolType === 'ballnose'),
    );
    const surfaceToolMismatch =
        surfaceOperation &&
        (!activeSlot ||
            !isSurfaceLibraryTool(activeSlot) ||
            (operation === 'surface-clear'
                ? activeSlot.toolType !== 'flat'
                : activeSlot.toolType !== 'ball' &&
                  activeSlot.toolType !== 'ballnose'));
    const cancelSurfaceGeneration = () => {
        surfaceAbortControllerRef.current?.abort();
        setStatus('Cancelling 3D CAM generation…');
    };
    useEffect(() => {
        const controller = surfaceAbortControllerRef.current;
        return () => {
            if (
                controller &&
                surfaceAbortControllerRef.current === controller
            ) {
                controller.abort();
                surfaceAbortControllerRef.current = null;
            }
        };
    }, [
        operation,
        selectedSurfaceBitmap?.id,
        slotNum,
        surfaceResolution,
        surfaceStepover,
        surfaceStepdown,
        surfaceAllowance,
        surfaceBoundary,
        surfaceBoundaryMode,
        selectedSurfaceBitmap,
        safeZ,
        stock.origin,
        stock.widthMm,
        stock.heightMm,
        stock.thicknessMm,
        machineTravelLimits,
    ]);
    useEffect(
        () => () => {
            surfaceAbortControllerRef.current?.abort();
            surfaceAbortControllerRef.current = null;
            laserAbortControllerRef.current?.abort();
            laserAbortControllerRef.current = null;
        },
        [],
    );
    const visibleOps = operationsForSelection({
        workspace,
        hasBitmap:
            workspace === 'laser' ? selectionHasBitmap || hasBitmap : hasBitmap,
        hasVector:
            workspace === 'laser' ? selectionHasVector || hasVector : hasVector,
        hasSurfaceModel: Boolean(selectedSurfaceModel),
        surfaceModelSelectedAlone: Boolean(selectedSurfaceBitmap),
    });
    useEffect(() => {
        if (
            selectedSurfaceBitmap &&
            !editEntry &&
            operation === 'profile-outside'
        ) {
            setOperation('surface-clear');
        } else if (!visibleOps.some((op) => op.value === operation)) {
            setOperation(visibleOps[0]?.value ?? 'profile-outside');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        hasBitmap,
        hasVector,
        selectionHasBitmap,
        selectionHasVector,
        workspace,
        selectedSurfaceBitmap?.id,
    ]);

    const selectedRasterImage = bitmaps.find(
        (b) => b.id === active.find((l) => l.bitmapId)?.bitmapId,
    );
    const { laserOptions, maskLinkError } = useMemo(() => {
        let error = '';
        let options: LaserOptions = storedLaserOptions.maskSourceIds?.length
            ? { ...storedLaserOptions, maskSourceIds: [], imageMask: [] }
            : storedLaserOptions;
        if (selectedRasterImage?.maskSourceIds?.length) {
            try {
                options = {
                    ...storedLaserOptions,
                    imageMask: resolveLinkedImageMask(
                        selectedRasterImage,
                        loops,
                    ),
                    maskSourceIds: selectedRasterImage.maskSourceIds,
                };
            } catch (e) {
                error = (e as Error).message;
            }
        }
        return { laserOptions: options, maskLinkError: error };
    }, [storedLaserOptions, selectedRasterImage, loops]);
    // Track input identity without rereading raster pixels on every render.
    const buildInputs = useMemo(
        () => ({}),
        [
            workspace,
            operation,
            loops,
            selected,
            bitmaps,
            editEntry,
            stock,
            machineProfileId,
            defaultArcs,
            chamferWidth,
            clearingEnabled,
            clearingSlot,
            slots,
            chamferTipOffset,
            cutterAngle,
            cutDepth,
            effectivePassDepth,
            laserFeed,
            laserPower,
            laserSpot,
            laserSMin,
            laserSMax,
            laserGamma,
            laserOverscan,
            laserOptions,
            surfaceResolution,
            surfaceStepover,
            surfaceStepdown,
            surfaceAllowance,
            surfaceBoundary,
            surfaceBoundaryMode,
            safeZ,
            effectiveFeedRate,
            effectivePlungeRate,
            effectiveSpindle,
            activeSlot?.slot,
            activeSlot?.toolType,
            activeSlot?.cuttingDiameterMm,
            activeSlot?.libraryToolId,
            activeSlot?.name,
            machineTravelLimits?.maxXTravelMm,
            machineTravelLimits?.maxYTravelMm,
            machineTravelLimits?.minZTravelMm,
            machineTravelLimits?.maxZTravelMm,
        ],
    );
    const currentBuildInputs = useRef(buildInputs);
    currentBuildInputs.current = buildInputs;
    useEffect(() => {
        for (const controller of [
            laserAbortControllerRef.current,
            surfaceAbortControllerRef.current,
        ]) {
            if (controller && !controller.signal.aborted) {
                controller.abort();
                setStatus('Artwork or settings changed. Generate again.');
            }
        }
    }, [buildInputs]);
    const nativePixelSize =
        selectedRasterImage?.img?.naturalWidth &&
        selectedRasterImage.img.naturalHeight
            ? {
                  x:
                      selectedRasterImage.w /
                      selectedRasterImage.img.naturalWidth,
                  y:
                      selectedRasterImage.h /
                      selectedRasterImage.img.naturalHeight,
              }
            : undefined;

    const resolveRasterBitmap = (): RasterBitmap => {
        if (active.filter((l) => l.bitmapId).length > 1)
            throw new Error('Select one image per raster toolpath.');
        const loop = active.find((l) => l.bitmapId);
        const entry = loop && bitmaps.find((b) => b.id === loop.bitmapId);
        if (!entry?.img)
            throw new Error('Select an imported bitmap for Laser Raster.');
        return {
            imageData: imageDataOf(entry.img),
            rotation: entry.rotation,
            bounds: {
                minX: entry.x,
                minY: entry.y,
                maxX: entry.x + entry.w,
                maxY: entry.y + entry.h,
            },
        };
    };

    // Legacy auto tab height: follows half the cut depth until edited.
    useEffect(() => {
        if (autoTabHeight) setTabHeight(Math.max(0.1, cutDepth / 2));
    }, [cutDepth, autoTabHeight]);

    const buildArgs = () => {
        if (maskLinkError) throw new Error(maskLinkError);
        let bitmap: RasterBitmap | undefined;
        if (
            operation === 'laser-raster' ||
            operation === 'wavy-raster' ||
            operation === 'halftone'
        ) {
            bitmap = resolveRasterBitmap();
        }
        // Editing preserves the entry's existing tabs.
        const tabs = LASER_OPS.includes(operation)
            ? ((editEntry?.args.tabs as PlacedTab[] | undefined) ?? [])
            : !tabsEnabled
              ? []
              : editEntry
                ? (((editEntry.args as ProfileArgs).tabs as PlacedTab[]) ?? [])
                : [];
        const chamfer =
            operation === 'chamfer' && chamferWidth !== null
                ? edgeChamferDimensions(
                      chamferWidth,
                      chamferTipOffset,
                      cutterAngle,
                      toolDiameter,
                  )
                : null;
        let clearingTool: ProfileArgs['vCarveClearingTool'];
        if (operation === 'vcarve' && clearingEnabled) {
            const tool = slots.find(
                (s) =>
                    s.slot === clearingSlot &&
                    s.toolType === 'flat' &&
                    isConfigured(s),
            );
            if (!tool) throw new Error('Choose a flat endmill for clearing.');
            if (tool.cuttingLengthMm && cutDepth > tool.cuttingLengthMm)
                throw new Error(
                    'Clearing depth exceeds the endmill cutting length.',
                );
            const saved = editEntry?.args.vCarveClearingTool;
            if (saved?.toolNumber === clearingSlot) clearingTool = saved;
            else {
                const recipe = recommendCuttingParameters({
                    material,
                    machine,
                    operation: 'pocket',
                    stockDepthMm: stock.thicknessMm,
                    cutter: {
                        toolType: 'flat',
                        diameterMm: tool.cuttingDiameterMm!,
                        flutes: tool.flutes!,
                        cuttingLengthMm: tool.cuttingLengthMm,
                        cutterMaterial: tool.cutterMaterial || undefined,
                    },
                });
                clearingTool = {
                    toolDiameter: tool.cuttingDiameterMm!,
                    toolNumber: tool.slot,
                    libraryToolId: tool.libraryToolId ?? undefined,
                    libraryToolName: tool.name,
                    feedRate: recipe.feedMmMin,
                    plungeRate: recipe.plungeMmMin,
                    spindle: recipe.rpm,
                    passDepth: recipe.passDepthMm,
                };
            }
        }
        if (
            editEntry?.args.vCarveInset &&
            (activeSlot?.toolType !== 'flat' || operation !== 'pocket')
        )
            throw new Error(
                'Linked V-carve clearing must remain a Pocket operation with a flat endmill.',
            );
        return {
            ...(editEntry?.args.vCarveInset
                ? { vCarveInset: editEntry.args.vCarveInset }
                : {}),
            ...(clearingTool ? { vCarveClearingTool: clearingTool } : {}),
            ...(clearingTool || editEntry?.args.vCarvePairId
                ? {
                      vCarvePairId:
                          editEntry?.args.vCarvePairId ??
                          createDocumentId('vcarve-pair'),
                  }
                : {}),
            ...(chamfer
                ? {
                      chamferWidthMm: chamferWidth!,
                      chamferTipOffsetMm: chamferTipOffset,
                  }
                : {}),
            loops:
                operation === 'profile-outside' && selectedSurfaceBitmap
                    ? surfaceFootprintLoops(selectedSurfaceBitmap)
                    : active,
            operation,
            toolDiameter,
            cutDepth:
                operation === 'countersink'
                    ? countersinkHeadDiameter /
                      2 /
                      Math.tan((cutterAngle * Math.PI) / 360)
                    : (chamfer?.cutDepth ?? cutDepth),
            countersinkHeadDiameterMm: countersinkHeadDiameter,
            cutterAngle,
            cutterType: activeSlot?.toolType ?? 'flat',
            laserFeed,
            laserPower,
            laserSpot,
            laserSMin,
            laserSMax: operation === 'laser-raster' ? laserPower : laserSMax,
            laserGamma,
            laserOverscan,
            laserOptions,
            wavySpot: wavySpacing,
            wavyMinDepth: wavyShallow,
            wavyMaxDepth: wavyDeep,
            wavyFeed,
            halftoneResolution: halftoneRes,
            halftoneInvert,
            textureType,
            material,
            stockThicknessMm: stock.thicknessMm,
            machineProfileId,
            textureSpacing,
            crosshatchAngle,
            bitmap,
            trochoidEnabled:
                trochoid &&
                (operation === 'profile-outside' ||
                    operation === 'profile-inside' ||
                    operation === 'pocket'),
            trochoidEngagementPercent: engagement,
            helicalEntryEnabled:
                helicalEntry &&
                (operation === 'profile-outside' ||
                    operation === 'profile-inside' ||
                    operation === 'pocket'),
            feedRate: effectiveFeedRate,
            plungeRate: effectivePlungeRate,
            spindle: effectiveSpindle,
            safeZ,
            passDepth:
                operation === 'countersink'
                    ? countersinkHeadDiameter /
                      2 /
                      Math.tan((cutterAngle * Math.PI) / 360)
                    : operation === 'texture-fill'
                      ? cutDepth
                      : effectivePassDepth,
            libraryToolId: LASER_OPS.includes(operation)
                ? undefined
                : (activeSlot?.libraryToolId ?? undefined),
            libraryToolName: LASER_OPS.includes(operation)
                ? undefined
                : activeSlot?.name || undefined,
            surfaceBitmapId: selectedSurfaceBitmap?.id,
            surfaceResolutionMm: surfaceResolution,
            surfaceStepoverMm: surfaceStepover,
            surfaceStepdownMm: surfaceStepdown,
            surfaceStockToLeaveMm: surfaceAllowance,
            surfaceBoundaryMm: surfaceBoundary,
            surfaceBoundaryMode,
            arcs: defaultArcs,
            overlapPercent: overlap,
            tabWidth,
            tabHeight:
                !LASER_OPS.includes(operation) && tabsEnabled ? tabHeight : 0,
            toolNumber,
            tabs,
            fileName: 'gcam',
        };
    };

    const handleGenerate = () => {
        if (LASER_OPS.includes(operation) && !laserSettingsReady) {
            setStatus('Choose calibrated laser settings or use manual values.');
            return;
        }
        // Laser ops don't use endmills; mill ops need a configured slot.
        if (!LASER_OPS.includes(operation)) {
            if (!activeSlot || !isConfigured(activeSlot)) {
                setStatus(
                    'Set up and select an endmill slot before creating a toolpath.',
                );
                return;
            }
            if (vbitMismatch) {
                setStatus(
                    `${operation === 'countersink' ? 'V-Bit Countersink' : operation === 'chamfer' ? 'Chamfer' : operation === 'vcarve' ? 'V-Carve' : operation === 'texture-fill' ? 'Texture Fill' : operation === 'wavy-raster' ? 'Wavy' : 'Halftone'} requires a V-bit — pick one from your tool rack.`,
                );
                return;
            }
        }
        setBusy(true);
        setStatus('Building toolpath…');
        let args: ReturnType<typeof buildArgs>;
        try {
            args = buildArgs();
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Raster needs a bitmap');
            setBusy(false);
            return;
        }
        if (operation === 'countersink' && args.cutDepth > stock.thicknessMm) {
            setStatus(
                `That V-bit countersink needs ${args.cutDepth.toFixed(2)} mm depth, deeper than the ${stock.thicknessMm.toFixed(2)} mm stock. Use a smaller head diameter or a wider-angle V-bit.`,
            );
            setBusy(false);
            return;
        }
        if (
            operation === 'chamfer' &&
            args.chamferWidthMm !== undefined &&
            args.cutDepth > stock.thicknessMm
        ) {
            setStatus(
                'Chamfer tip would go below the stock. Reduce width or tip offset.',
            );
            setBusy(false);
            return;
        }
        if (surfaceOperation) {
            if (surfaceToolMismatch || !activeSlot || !selectedSurfaceBitmap) {
                setStatus(
                    surfaceToolMismatch
                        ? operation === 'surface-clear'
                            ? '3D clearing needs a configured flat-bottom endmill selected from the tool library.'
                            : operation === 'surface-waterline'
                              ? '3D waterline finishing needs a configured ball endmill selected from the tool library.'
                              : '3D finishing needs a configured ball endmill selected from the tool library.'
                        : 'Select an imported 3D model heightmap before creating a surface toolpath.',
                );
                setBusy(false);
                return;
            }
            if (selectedSurfaceBitmap.surfaceMachinableTopDown === false) {
                setStatus(
                    'Choose and apply a machining setup direction with a valid upward-facing surface before generating 3D CAM.',
                );
                setBusy(false);
                return;
            }
            const mesh = transformStoredSurfaceMesh(selectedSurfaceBitmap);
            if (!mesh) {
                setStatus(
                    'The selected 3D model data is missing or invalid. Re-import the model.',
                );
                setBusy(false);
                return;
            }
            const cutterRadius = activeSlot.cuttingDiameterMm! / 2;
            if (
                mesh.bounds.minX - cutterRadius - surfaceBoundary <
                    jobStockBounds(stock).minX ||
                mesh.bounds.minY - cutterRadius - surfaceBoundary <
                    jobStockBounds(stock).minY ||
                mesh.bounds.maxX + cutterRadius + surfaceBoundary >
                    jobStockBounds(stock).maxX ||
                mesh.bounds.maxY + cutterRadius + surfaceBoundary >
                    jobStockBounds(stock).maxY
            ) {
                setStatus(
                    `The 3D model, cutter, and boundary overrun (${surfaceBoundary} mm) do not fit inside the job stock with safe edge clearance. Reduce the boundary, move or resize the model, or use larger stock.`,
                );
                setBusy(false);
                return;
            }
            if (mesh.bounds.minZ < -stock.thicknessMm - 1e-5) {
                setStatus(
                    'The 3D model extends below the job stock thickness. Increase stock thickness or resize the model.',
                );
                setBusy(false);
                return;
            }
            const cutter = activeSlot.toolType;
            if (operation === 'surface-clear' && cutter !== 'flat') {
                setStatus(
                    '3D clearing requires a flat-bottom endmill from the tool library.',
                );
                setBusy(false);
                return;
            }
            if (
                operation !== 'surface-clear' &&
                cutter !== 'ball' &&
                cutter !== 'ballnose'
            ) {
                setStatus(
                    operation === 'surface-waterline'
                        ? '3D waterline finishing requires a ball endmill from the tool library.'
                        : '3D finishing requires a ball endmill from the tool library.',
                );
                setBusy(false);
                return;
            }
            setStatus('Rasterizing 3D model and building surface paths…');
            const controller = new AbortController();
            surfaceAbortControllerRef.current?.abort();
            surfaceAbortControllerRef.current = controller;
            const inputs = currentBuildInputs.current;
            const discardChangedResult = () => {
                if (inputs === currentBuildInputs.current) return false;
                controller.abort();
                setStatus('Artwork or settings changed. Generate again.');
                return true;
            };
            void generateSurfaceCamPaths(
                mesh,
                {
                    strategy: operation,
                    cutter: cutter as 'flat' | 'ball' | 'ballnose',
                    toolDiameterMm: activeSlot.cuttingDiameterMm!,
                    stepoverMm: surfaceStepover,
                    stepdownMm: surfaceStepdown,
                    stockToLeaveMm:
                        operation === 'surface-clear' ? surfaceAllowance : 0,
                    boundaryMm:
                        operation === 'surface-waterline' &&
                        surfaceBoundaryMode === 'model'
                            ? 0
                            : surfaceBoundary,
                    boundaryMode: surfaceBoundaryMode,
                    safeZMm: safeZ,
                    stockTopZMm: 0,
                    travelLimits: machineTravelLimits,
                    stock: {
                        widthMm: stock.widthMm,
                        heightMm: stock.heightMm,
                        thicknessMm: stock.thicknessMm,
                        origin: stock.origin,
                    },
                    resolutionMm: surfaceResolution,
                },
                (progress) => {
                    if (!controller.signal.aborted && !discardChangedResult())
                        onDraftProgress?.(progress);
                },
                controller.signal,
            )
                .then((generated) => {
                    if (controller.signal.aborted || discardChangedResult())
                        return;
                    const result = buildSurfaceToolpathResult({
                        operation,
                        paths: generated.paths,
                        toolDiameter: activeSlot.cuttingDiameterMm!,
                        cutterType: cutter,
                        libraryToolId: activeSlot.libraryToolId ?? undefined,
                        libraryToolName: activeSlot.name || undefined,
                        toolNumber: activeSlot.slot,
                        feedRate: effectiveFeedRate,
                        plungeRate: effectivePlungeRate,
                        spindle: effectiveSpindle,
                        safeZ,
                        stepdown: surfaceStepdown,
                        stockToLeave:
                            operation === 'surface-clear'
                                ? surfaceAllowance
                                : 0,
                        surfaceBitmapId: selectedSurfaceBitmap.id,
                        fileName: 'gcam',
                    });
                    if (editEntry && onUpdate)
                        onUpdate(editEntry.id, result, args);
                    else onResult(result, args);
                    setStatus(
                        `${result.label} — ${generated.paths.length} paths, ${result.gcode.split('\n').length} G-code lines (${generated.rasterBackend.toUpperCase()} mesh raster, ${generated.computeBackend.toUpperCase()} cutter compensation).`,
                    );
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return;
                    setStatus(
                        error instanceof Error
                            ? error.message
                            : 'WebGPU surface CAM failed.',
                    );
                })
                .finally(() => {
                    if (surfaceAbortControllerRef.current !== controller)
                        return;
                    surfaceAbortControllerRef.current = null;
                    onDraftProgress?.(null);
                    setBusy(false);
                });
            return;
        }
        if (
            (LASER_OPS.includes(operation) ||
                operation === 'chamfer' ||
                operation === 'vcarve' ||
                Boolean(args.vCarveInset)) &&
            typeof Worker !== 'undefined'
        ) {
            laserDraftControllerRef.current?.abort();
            draftToken.current += 1;
            onDraftProgress?.(null);
            const controller = new AbortController();
            laserAbortControllerRef.current?.abort();
            laserAbortControllerRef.current = controller;
            const inputs = currentBuildInputs.current;
            const discardChangedResult = () => {
                if (inputs === currentBuildInputs.current) return false;
                controller.abort();
                setStatus('Artwork or settings changed. Generate again.');
                return true;
            };
            setLaserBuildProgress(0);
            void buildToolpathGcodeAsync({
                ...args,
                signal: controller.signal,
                onProgress: (percent, label) => {
                    if (controller.signal.aborted || discardChangedResult())
                        return;
                    setLaserBuildProgress(Math.round(percent));
                    setStatus(label);
                },
            })
                .then((result) => {
                    if (controller.signal.aborted || discardChangedResult())
                        return;
                    if (editEntry && onUpdate)
                        onUpdate(editEntry.id, result, args);
                    else onResult(result, args);
                    setStatus(
                        `${result.label} — ${result.gcode.split('\n').length} lines.`,
                    );
                })
                .catch((error: unknown) => {
                    if (!controller.signal.aborted)
                        setStatus(
                            error instanceof Error
                                ? error.message
                                : 'Toolpath build failed.',
                        );
                })
                .finally(() => {
                    if (laserAbortControllerRef.current !== controller) return;
                    laserAbortControllerRef.current = null;
                    setLaserBuildProgress(undefined);
                    setBusy(false);
                });
            return;
        }
        buildToolpathGcode(args).then(
            (result) => {
                if (editEntry && onUpdate) {
                    onUpdate(editEntry.id, result, args);
                } else {
                    onResult(result, args);
                }
                setStatus(
                    `${result.label} — ${result.gcode.split('\n').length} lines.`,
                );
                setBusy(false);
            },
            (e) => {
                setStatus(e instanceof Error ? e.message : 'Engine error');
                setBusy(false);
            },
        );
    };

    // Live dashed draft preview (camcanvas draftToolpath): rebuild the
    // current form debounced in the CAM worker with progress, so the
    // canvas previews before committing. Falls back to a sync build if
    // the worker is unavailable. Unlike commit, the draft uses the live
    // form values directly so a preview renders even before a tool slot
    // is configured.
    const [rasterDraft, setRasterDraft] = useState<DraftContour[]>([]);
    const publishDraft = (contours: { x: number; y: number }[][] | null) => {
        setRasterDraft(operation === 'laser-raster' ? (contours ?? []) : []);
        onDraftPreview?.(contours);
    };
    const draftToken = useRef(0);
    const draftCallbacksRef = useRef({ onDraftPreview, onDraftProgress });
    draftCallbacksRef.current = {
        onDraftPreview: publishDraft,
        onDraftProgress,
    };
    useEffect(
        () => () => {
            // The panel unmounts when the user clears the canvas selection.
            // Invalidate any in-flight worker response so it cannot restore
            // the now-stale draft after the rail has been reset.
            draftToken.current += 1;
            draftCallbacksRef.current.onDraftPreview?.(null);
            draftCallbacksRef.current.onDraftProgress?.(null);
        },
        [],
    );
    const [draftError, setDraftError] = useState<string | null>(null);
    const solidDraftPreview =
        operation.startsWith('laser-') ||
        (operation === 'texture-fill' && textureType === 'crosshatch');
    useEffect(() => {
        const token = ++draftToken.current;
        if (!onDraftPreview && !onDraftProgress) return;
        if (busy) {
            onDraftProgress?.(null);
            return;
        }
        if (surfaceOperation) {
            publishDraft(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        if ((!editEntry && selected.length === 0) || !active.length) {
            publishDraft(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        if (vbitMismatch) {
            // Don't fire the worker with a tool that can't run this
            // operation — the amber alert above already tells the user to
            // pick a V-bit. Firing anyway only surfaces a cryptic engine
            // error for a condition we can detect locally.
            publishDraft(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        const controller = new AbortController();
        if (operation.startsWith('laser-'))
            laserDraftControllerRef.current = controller;
        // CAMCanvas shows the worker badge as soon as a draft job starts.
        // Set this before the debounce so a real long-running operation is
        // visible for its whole run rather than only after a later callback.
        onDraftProgress?.({
            percent: 4,
            label: 'Preview: Calculating toolpath',
        });
        const timer = window.setTimeout(() => {
            let args: ReturnType<typeof buildArgs>;
            try {
                args = buildArgs();
            } catch (e) {
                if (token === draftToken.current) {
                    publishDraft(null);
                    onDraftProgress?.(null);
                    setDraftError(
                        e instanceof Error ? e.message : 'Preview unavailable',
                    );
                }
                return;
            }
            const report = (percent: number, label: string) => {
                if (token !== draftToken.current) return;
                const numericPercent = Number(percent);
                const safePercent = Number.isFinite(numericPercent)
                    ? Math.min(100, Math.max(0, numericPercent))
                    : 0;
                onDraftProgress?.({
                    percent: safePercent,
                    label: `Preview: ${label || 'Calculating toolpath'}`,
                });
            };
            report(4, 'Calculating toolpath');
            // Race the worker against a timeout so a hung worker still
            // falls back to the sync build instead of stalling the preview.
            const raced = new Promise<ToolpathResult>((resolve, reject) => {
                const timer = window.setTimeout(() => {
                    const error = new Error('Preview timed out');
                    reject(error);
                    controller.abort(error);
                }, 20000);
                buildToolpathGcodeAsync({
                    ...args,
                    geometryOnly: operation.startsWith('laser-'),
                    tabs: operation.startsWith('laser-') ? args.tabs : [],
                    onProgress: report,
                    signal: controller.signal,
                }).then(
                    (result) => {
                        window.clearTimeout(timer);
                        resolve(result);
                    },
                    (e) => {
                        window.clearTimeout(timer);
                        reject(e);
                    },
                );
            });
            raced.then(
                (result) => {
                    if (token !== draftToken.current) return;
                    publishDraft(
                        canvasDraftContours(
                            [
                                ...result.previewContours,
                                ...(result.trochoidPreviewContours ?? []),
                            ],
                            solidDraftPreview,
                        ),
                    );
                    onDraftProgress?.(null);
                    setDraftError(null);
                },
                (workerError) => {
                    // Worker fallback: sync main-thread build. Keep the
                    // pill up (indeterminate) so the wait is visible.
                    if (token !== draftToken.current) return;
                    if (
                        operation.startsWith('laser-') &&
                        typeof Worker !== 'undefined'
                    ) {
                        publishDraft(null);
                        onDraftProgress?.(null);
                        setDraftError(
                            workerError instanceof Error
                                ? workerError.message
                                : 'Preview unavailable',
                        );
                        return;
                    }
                    report(4, 'Calculating toolpath');
                    buildToolpathGcode({ ...args, tabs: [] }).then(
                        (result) => {
                            if (token === draftToken.current) {
                                publishDraft(
                                    canvasDraftContours(
                                        [
                                            ...result.previewContours,
                                            ...(result.trochoidPreviewContours ??
                                                []),
                                        ],
                                        solidDraftPreview,
                                    ),
                                );
                                onDraftProgress?.(null);
                                setDraftError(null);
                            }
                        },
                        (e) => {
                            if (token === draftToken.current) {
                                publishDraft(null);
                                setDraftError(
                                    e instanceof Error
                                        ? e.message
                                        : workerError instanceof Error
                                          ? workerError.message
                                          : 'Preview unavailable',
                                );
                            }
                        },
                    );
                },
            );
        }, 400);
        return () => {
            window.clearTimeout(timer);
            draftToken.current += 1;
            controller.abort();
            if (laserDraftControllerRef.current === controller)
                laserDraftControllerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        busy,
        operation,
        clearingEnabled,
        clearingSlot,
        surfaceOperation,
        surfaceResolution,
        surfaceStepover,
        surfaceStepdown,
        surfaceAllowance,
        vbitMismatch,
        toolDiameter,
        cutDepth,
        chamferWidth,
        chamferTipOffset,
        cutterAngle,
        trochoid,
        engagement,
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        laserOverscan,
        laserOptions,
        wavySpacing,
        wavyShallow,
        wavyDeep,
        wavyFeed,
        halftoneRes,
        halftoneInvert,
        textureType,
        textureSpacing,
        crosshatchAngle,
        material,
        machineProfileId,
        solidDraftPreview,
        feedRate,
        plungeRate,
        spindle,
        manualCuttingParams,
        safeZ,
        passDepth,
        arcs,
        overlap,
        tabWidth,
        tabHeight,
        tabsEnabled,
        toolNumber,
        slotNum,
        slots,
        selected,
        loops,
        bitmaps,
    ]);

    if (!editEntry && (selected.length === 0 || active.length === 0)) {
        return <ToolpathEmptyState />;
    }

    return (
        <div className="toolpath-form p-3 space-y-3 text-sm">
            <section className="toolpath-form-operation space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Operation
                </h3>
                <ToolpathOperationPicker
                    operation={operation}
                    operations={visibleOps}
                    onChange={setOperation}
                />
            </section>
            <ToolpathFormAlerts
                operation={operation}
                vbitMismatch={vbitMismatch}
                draftError={draftError}
            />
            {!LASER_OPS.includes(operation) && (
                <section className="toolpath-form-tool space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Tool selection
                    </h3>
                    <ToolSelectionFields
                        slots={
                            surfaceOperation ? compatibleSurfaceTools : slots
                        }
                        hasAnyConfiguredTool={slots.some(isConfigured)}
                        slotNum={slotNum}
                        units={units}
                        libraryOpen={toolLibOpen}
                        librarySlot={toolLibSlot}
                        onOpenLibrary={() => setToolLibOpen(true)}
                        onSetupTools={() => {
                            const firstEmptySlot = slots.find(
                                (tool) => !isConfigured(tool),
                            );
                            const setupSlot = firstEmptySlot?.slot ?? null;
                            if (setupSlot != null) setSlotNum(setupSlot);
                            setToolLibSlot(setupSlot);
                            setToolLibOpen(true);
                        }}
                        onSelectSlot={(slotNumber) => {
                            setSlotNum(slotNumber);
                            const slot = slots.find(
                                (item) => item.slot === slotNumber,
                            );
                            if (slot && isConfigured(slot)) {
                                applySlot(slot);
                            } else {
                                setToolLibSlot(slotNumber);
                                setToolLibOpen(true);
                            }
                        }}
                        onCloseLibrary={() => {
                            setToolLibOpen(false);
                            setToolLibSlot(null);
                            if (typeof window !== 'undefined')
                                setSlots(loadSlots(window.localStorage));
                        }}
                        onConfiguredSlot={applySlot}
                    />
                </section>
            )}
            <section className="toolpath-form-settings space-y-3 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Toolpath settings
                </h3>
                {recipeOperation && (
                    <CuttingRecipeFields
                        recommendation={recommendation}
                        units={units}
                        manual={manualCuttingParams}
                        onManualChange={setManualCuttingParams}
                        feedRate={feedRate}
                        onFeedRateChange={setFeedRate}
                        plungeRate={plungeRate}
                        onPlungeRateChange={setPlungeRate}
                        spindle={spindle}
                        onSpindleChange={setSpindle}
                        maxDepth={
                            surfaceOperation ? surfaceStepdown : passDepth
                        }
                        maxDepthLabel={
                            surfaceOperation
                                ? 'Surface stepdown'
                                : 'Max depth per pass'
                        }
                        onMaxDepthChange={
                            surfaceOperation ? setSurfaceStepdown : setPassDepth
                        }
                    />
                )}
                {!LASER_OPS.includes(operation) &&
                    !surfaceOperation &&
                    operation !== 'countersink' &&
                    (operation !== 'chamfer' || chamferWidth === null) && (
                        <label className="block space-y-1">
                            <span className="text-slate-500 dark:text-slate-400">
                                Cut depth ({units === 'imperial' ? 'in' : 'mm'})
                            </span>
                            <UnitInput
                                aria-label={`Cut depth (${units === 'imperial' ? 'in' : 'mm'})`}
                                units={units}
                                stepMm={0.1}
                                minMm={0.1}
                                valueMm={cutDepth}
                                disabled={Boolean(editEntry?.args.vCarveInset)}
                                onChangeMm={(value) => {
                                    setCutDepth(value);
                                    setAutoCutDepth(false);
                                }}
                                className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                            />
                            <span className="block text-xs text-slate-600 dark:text-slate-300">
                                {cutDepth >= stock.thicknessMm
                                    ? 'Cuts through the full material thickness.'
                                    : 'Depth measured down from the top surface.'}
                            </span>
                        </label>
                    )}
                {operation === 'vcarve' && (
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={clearingEnabled}
                                onChange={(e) => {
                                    setClearingEnabled(e.target.checked);
                                    if (!clearingSlot)
                                        setClearingSlot(
                                            slots.find(
                                                (s) =>
                                                    s.toolType === 'flat' &&
                                                    isConfigured(s),
                                            )?.slot ?? 0,
                                        );
                                }}
                            />
                            Add clearing toolpath
                        </label>
                        {clearingEnabled && (
                            <>
                                <label className="block space-y-1">
                                    Clearing endmill
                                    <select
                                        aria-label="Clearing endmill"
                                        value={clearingSlot}
                                        onChange={(e) =>
                                            setClearingSlot(
                                                Number(e.target.value),
                                            )
                                        }
                                        className="w-full rounded border border-slate-300 bg-slate-100 px-2 py-1 dark:bg-dark-lighter dark:border-robin-900"
                                    >
                                        <option value={0}>
                                            Choose flat endmill
                                        </option>
                                        {slots
                                            .filter(
                                                (s) =>
                                                    s.toolType === 'flat' &&
                                                    isConfigured(s),
                                            )
                                            .map((s) => (
                                                <option
                                                    key={s.slot}
                                                    value={s.slot}
                                                >
                                                    T{s.slot}: {s.name}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                                <p className="text-xs text-slate-500">
                                    Pocket clearing first, then V-bit finishing.
                                    Edit cutting settings on each saved
                                    toolpath.
                                </p>
                            </>
                        )}
                    </div>
                )}
                {editEntry?.args.vCarveInset && (
                    <p className="text-xs text-slate-500">
                        Clearing depth follows the linked V-carve.
                    </p>
                )}
                {operation === 'chamfer' && (
                    <ChamferFields
                        width={chamferWidth}
                        tipOffset={chamferTipOffset}
                        angle={cutterAngle}
                        diameter={toolDiameter}
                        units={units}
                        onWidth={setChamferWidth}
                        onTipOffset={setChamferTipOffset}
                    />
                )}
                {operation === 'countersink' && (
                    <label className="block space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Screw head diameter (
                            {units === 'imperial' ? 'in' : 'mm'})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0.5}
                            valueMm={countersinkHeadDiameter}
                            onChangeMm={setCountersinkHeadDiameter}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Single plunge depth:{' '}
                            {(
                                countersinkHeadDiameter /
                                2 /
                                Math.tan((cutterAngle * Math.PI) / 360)
                            ).toFixed(2)}{' '}
                            mm, calculated from the selected V-bit angle.
                        </span>
                    </label>
                )}
                {!surfaceOperation && !LASER_OPS.includes(operation) && (
                    <CuttingFields
                        operation={operation}
                        units={units}
                        overlap={overlap}
                        onOverlapChange={setOverlap}
                        trochoid={trochoid}
                        onTrochoidChange={setTrochoid}
                        engagement={engagement}
                        onEngagementChange={setEngagement}
                        helicalEntry={helicalEntry}
                        onHelicalEntryChange={setHelicalEntry}
                        tabsEnabled={tabsEnabled}
                        onTabsEnabledChange={setTabsEnabled}
                        tabWidth={tabWidth}
                        onTabWidthChange={setTabWidth}
                        tabHeight={tabHeight}
                        onTabHeightChange={(value) => {
                            setTabHeight(value);
                            setAutoTabHeight(
                                Math.abs(value - Math.max(0.1, cutDepth / 2)) <
                                    0.0001,
                            );
                        }}
                    />
                )}
                {surfaceOperation && (
                    <section
                        className={`space-y-2 rounded-lg border p-3 ${surfaceHeight > stock.thicknessMm + 0.001 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-300 dark:border-robin-900'}`}
                    >
                        <h3 className="text-sm font-semibold">
                            Model placement
                        </h3>
                        <p className="text-xs">
                            Model height: {displayValue(surfaceHeight, units)}{' '}
                            {units === 'imperial' ? 'in' : 'mm'}. Top aligned to
                            stock top (Z=0); stock extends below zero.
                        </p>
                        {surfaceHeight > stock.thicknessMm + 0.001 && (
                            <p
                                role="alert"
                                className="text-sm font-semibold text-amber-800 dark:text-amber-200"
                            >
                                Model is taller than the stock. Correct the
                                stock thickness or fit the model before adding a
                                toolpath.
                            </p>
                        )}
                        <label className="block text-xs">
                            Job stock thickness
                            <UnitInput
                                units={units}
                                disabled={busy || !onStockThickness}
                                minMm={0.1}
                                valueMm={stock.thicknessMm}
                                onChangeMm={(value) =>
                                    onStockThickness?.(value)
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:bg-dark"
                            />
                        </label>
                        {selectedSurfaceBitmap && onFitSurface && (
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    disabled={busy || !surfaceHeight}
                                    onClick={() =>
                                        onFitSurface(
                                            selectedSurfaceBitmap.id,
                                            'uniform',
                                        )
                                    }
                                    className="rounded border border-slate-400 px-2 py-2 text-xs disabled:opacity-50"
                                >
                                    Fit to stock — scale XYZ together
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || !surfaceHeight}
                                    onClick={() =>
                                        onFitSurface(
                                            selectedSurfaceBitmap.id,
                                            'z',
                                        )
                                    }
                                    className="rounded border border-slate-400 px-2 py-2 text-xs disabled:opacity-50"
                                >
                                    Fit to stock — scale Z only
                                </button>
                                <p className="text-[11px] text-slate-500">
                                    XYZ preserves proportions and changes the
                                    footprint. Z only keeps the footprint and
                                    changes the relief height.
                                </p>
                            </div>
                        )}
                    </section>
                )}
                {surfaceOperation && (
                    <SurfaceCamFields
                        operation={operation}
                        units={units}
                        resolution={surfaceResolution}
                        stepover={surfaceStepover}
                        stepdown={surfaceStepdown}
                        allowance={surfaceAllowance}
                        boundary={surfaceBoundary}
                        boundaryMode={surfaceBoundaryMode}
                        onBoundaryMode={setSurfaceBoundaryMode}
                        onResolution={setSurfaceResolution}
                        onStepover={setSurfaceStepover}
                        onStepdown={setSurfaceStepdown}
                        onAllowance={setSurfaceAllowance}
                        onBoundary={setSurfaceBoundary}
                        hasModel={Boolean(selectedSurfaceBitmap)}
                        toolReady={!surfaceToolMismatch}
                    />
                )}
                <VBitRasterFields
                    operation={operation}
                    units={units}
                    halftoneResolution={halftoneRes}
                    onHalftoneResolutionChange={setHalftoneRes}
                    halftoneInvert={halftoneInvert}
                    onHalftoneInvertChange={setHalftoneInvert}
                    wavySpacing={wavySpacing}
                    onWavySpacingChange={setWavySpacing}
                    wavyFeed={wavyFeed}
                    onWavyFeedChange={setWavyFeed}
                    wavyShallow={wavyShallow}
                    onWavyShallowChange={setWavyShallow}
                    wavyDeep={wavyDeep}
                    onWavyDeepChange={setWavyDeep}
                />
                {operation === 'texture-fill' && (
                    <TextureFields
                        units={units}
                        textureType={textureType}
                        textureSpacing={textureSpacing}
                        crosshatchAngle={crosshatchAngle}
                        onTypeChange={setTextureType}
                        onSpacingChange={setTextureSpacing}
                        onCrosshatchAngleChange={setCrosshatchAngle}
                    />
                )}
                {LASER_OPS.includes(operation) && (
                    <LaserSettingsFields
                        settingsSources={laserSettingsSources}
                        currentOperationId={editEntry?.id}
                        onSettingsTransfer={(settings) => {
                            setLaserFeed(settings.feed);
                            setLaserPower(settings.power);
                            setLaserSpot(settings.interval);
                            setLaserGamma(settings.gamma);
                            setLaserSMin(settings.minPower);
                            setLaserSMax(settings.maxPower);
                            setLaserOverscan(settings.overscan);
                            setLaserOptions((current) => ({
                                ...current,
                                ...settings.options,
                            }));
                        }}
                        nativePixelSize={nativePixelSize}
                        operation={operation}
                        units={units}
                        options={laserOptions}
                        onChange={setLaserOptions}
                        gamma={laserGamma}
                        setGamma={setLaserGamma}
                        feed={laserFeed}
                        power={laserPower}
                        interval={laserSpot}
                        setFeed={setLaserFeed}
                        setPower={setLaserPower}
                        setInterval={setLaserSpot}
                        overscan={laserOverscan}
                        setOverscan={setLaserOverscan}
                        stock={stock}
                        editing={Boolean(editEntry)}
                        onReady={setLaserSettingsReady}
                        material={stock.laserMaterial ?? 'plywood'}
                        thickness={stock.thicknessMm}
                        machineId={machineProfileId}
                    />
                )}
                {operation === 'laser-raster' && (
                    <RasterRegionFields
                        linkIds={selectedRasterImage?.maskSourceIds}
                        linkError={maskLinkError}
                        maskShapeIds={selectedLoops
                            .filter((l) => !l.bitmapId)
                            .map((l) => l.id)}
                        onMaskLink={
                            selectedRasterImage && onMaskLink
                                ? (ids) =>
                                      onMaskLink(selectedRasterImage.id, ids)
                                : undefined
                        }
                        units={units}
                        options={laserOptions}
                        onChange={setLaserOptions}
                        maskShapes={selectedLoops
                            .filter((l) => !l.bitmapId)
                            .map((l) => l.points)}
                        image={bitmaps.find(
                            (b) =>
                                b.id ===
                                active.find((l) => l.bitmapId)?.bitmapId,
                        )}
                    />
                )}
                {operation === 'laser-raster' &&
                    onFlattenImage &&
                    selectedRasterImage?.dataUrl &&
                    (Boolean(laserOptions.imageMask?.length) ||
                        (laserOptions.imageCrop &&
                            (laserOptions.imageCrop.left !== 0 ||
                                laserOptions.imageCrop.bottom !== 0 ||
                                laserOptions.imageCrop.right !== 1 ||
                                laserOptions.imageCrop.top !== 1))) && (
                        <>
                            <button
                                type="button"
                                className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-robin-900"
                                disabled={Boolean(maskLinkError)}
                                onClick={() => setFlattening(true)}
                            >
                                Flatten image region…
                            </button>
                            {flattening && (
                                <LaserImageFlatten
                                    bitmap={{
                                        ...selectedRasterImage,
                                        dataUrl: selectedRasterImage.dataUrl,
                                    }}
                                    maskSources={loops.filter((l) =>
                                        selectedRasterImage.maskSourceIds?.includes(
                                            l.id,
                                        ),
                                    )}
                                    shapes={loops.filter(
                                        (l) =>
                                            l.bitmapId ===
                                            selectedRasterImage.id,
                                    )}
                                    options={laserOptions}
                                    onClose={() => setFlattening(false)}
                                    onCommit={onFlattenImage}
                                />
                            )}
                        </>
                    )}
                {operation === 'laser-raster' && (
                    <LaserImageExport
                        sourceImage={selectedRasterImage?.img}
                        units={units}
                        onAdjust={(settings) => {
                            setLaserOptions(settings.options);
                            setLaserGamma(settings.gamma);
                            setLaserSpot(settings.interval);
                        }}
                        readBitmap={resolveRasterBitmap}
                        interval={laserSpot}
                        gamma={laserGamma}
                        options={laserOptions}
                    />
                )}
                {operation === 'laser-raster' && !draftError && (
                    <LaserRasterPreview
                        contours={rasterDraft}
                        frame={active[0]?.points ?? []}
                        interval={laserSpot}
                        maxPower={laserPower}
                        sourceImage={
                            bitmaps.find(
                                (b) =>
                                    b.id ===
                                    active.find((l) => l.bitmapId)?.bitmapId,
                            )?.img
                        }
                        crop={laserOptions.imageCrop}
                        onCrop={(imageCrop) =>
                            setLaserOptions((current) => ({
                                ...current,
                                imageCrop,
                            }))
                        }
                    />
                )}
                <RasterLaserFields
                    nativePixelSize={nativePixelSize}
                    passThrough={laserOptions.passThrough}
                    scanAngle={laserOptions.scanAngle}
                    operation={operation}
                    units={units}
                    laserFeed={laserFeed}
                    onLaserFeedChange={setLaserFeed}
                    laserPower={laserPower}
                    onLaserPowerChange={setLaserPower}
                    laserSpot={laserSpot}
                    onLaserSpotChange={setLaserSpot}
                    laserGamma={laserGamma}
                    onLaserGammaChange={setLaserGamma}
                    laserSMin={laserSMin}
                    onLaserSMinChange={setLaserSMin}
                    laserSMax={laserSMax}
                    onLaserSMaxChange={setLaserSMax}
                    laserOverscan={laserOverscan}
                    onLaserOverscanChange={setLaserOverscan}
                />
                <ToolpathSubmitControls
                    busy={busy}
                    progress={laserBuildProgress}
                    hasActiveGeometry={
                        active.length > 0 &&
                        !maskLinkError &&
                        (!LASER_OPS.includes(operation) ||
                            laserSettingsReady) &&
                        (!surfaceOperation ||
                            surfaceHeight <= stock.thicknessMm + 1e-5)
                    }
                    editEntry={editEntry !== null}
                    submitLabel={submitLabel}
                    selectedCount={selected.length}
                    status={status}
                    onGenerate={handleGenerate}
                    onCancelBuild={
                        laserAbortControllerRef.current
                            ? () => {
                                  laserAbortControllerRef.current?.abort();
                                  setStatus('Toolpath build cancelled.');
                              }
                            : surfaceAbortControllerRef.current
                              ? cancelSurfaceGeneration
                              : undefined
                    }
                    cancelBuildLabel={
                        workspace === 'laser'
                            ? 'Cancel laser build'
                            : operation === 'chamfer'
                              ? 'Cancel chamfer build'
                              : operation === 'vcarve' ||
                                  Boolean(editEntry?.args.vCarveInset)
                                ? 'Cancel toolpath build'
                                : 'Cancel 3D CAM build'
                    }
                    onCancelEdit={onCancelEdit}
                />
            </section>
        </div>
    );
});
