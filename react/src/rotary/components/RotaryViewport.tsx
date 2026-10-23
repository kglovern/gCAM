/**
 * Purpose: Rotary 3D viewport — one view whose content follows the mode:
 * conversational revolves the drawn profile, STL shows the mesh triangles.
 * Toolpath plots tool centers (= G-code), stock is translucent, no mesh lines.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { Box, Scan, PanelTop, Settings2, X } from 'lucide-react';
import { rotaryViewFit } from './viewportFit';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { DARK_CANVAS_THEME, LIGHT_CANVAS_THEME } from '../../canvas/theme';
import { MachineAlignmentControls } from './MachineAlignmentControls';
import {
    alignmentStorageKey,
    defaultAlignment,
    disposeMachine,
    machineViewFit,
    interpolateMachinePose,
    poseMachine,
    readAlignment,
} from './machinePreview';
import type {
    ProfileSample,
    RotaryMode,
    RotaryStock,
    StlMesh,
    ToolpathMove,
} from '../engine/types';

function revolveGeometry(
    samples: ProfileSample[],
    radialSegs = 96,
): THREE.BufferGeometry {
    const n = samples.length;
    const pos: number[] = [];
    const norm: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
        const { x, r } = samples[i];
        for (let j = 0; j <= radialSegs; j++) {
            const a = (j / radialSegs) * Math.PI * 2;
            pos.push(x, r * Math.cos(a), r * Math.sin(a));
            norm.push(0, Math.cos(a), Math.sin(a));
        }
    }
    const ring = radialSegs + 1;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < radialSegs; j++) {
            const a = i * ring + j;
            const b = a + ring;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    g.setIndex(idx);
    return g;
}

function stockGeometry(length: number, radius: number): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(radius, radius, length, 48, 1, true);
    g.rotateZ(Math.PI / 2);
    g.translate(length / 2, 0, 0);
    return g;
}

interface RotaryViewportProps {
    samples: ProfileSample[];
    stock: RotaryStock;
    moves: ToolpathMove[];
    showStock: boolean;
    showPath: boolean;
    stl: StlMesh | null;
    mode: RotaryMode;
    showMachine?: boolean;
    darkMode?: boolean;
}

export function RotaryViewport({
    samples,
    stock,
    moves,
    showStock,
    showPath,
    stl,
    mode,
    showMachine = true,
    darkMode = false,
}: RotaryViewportProps): ReactElement {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const [alignment, setAlignment] = useState(() => {
        try {
            return readAlignment(localStorage.getItem(alignmentStorageKey));
        } catch {
            return { ...defaultAlignment };
        }
    });
    const [machineStatus, setMachineStatus] = useState('Loading machine…');
    const [alignmentOpen, setAlignmentOpen] = useState(false);
    const machineRef = useRef<THREE.Group | null>(null);
    const input = useMemo(
        () => ({ samples, stock, moves, stl, mode, alignment }),
        [samples, stock, moves, stl, mode, alignment],
    );
    const preview = useDebouncedValue(input, 400);
    const animated = useRef({
        length: stock.length,
        diameter: stock.diameter,
        alignment,
    });
    const visibleRef = useRef(showMachine);
    visibleRef.current = showMachine;
    const fitMachineView = useRef<() => void>(() => {});
    const sideView = useRef<() => void>(() => {});
    const followSideView = useRef(true);
    useEffect(() => {
        try {
            localStorage.setItem(
                alignmentStorageKey,
                JSON.stringify(alignment),
            );
        } catch {
            /* Storage may be disabled. */
        }
    }, [alignment]);
    useEffect(() => {
        if (machineRef.current) machineRef.current.visible = showMachine;
    }, [showMachine]);
    const savedView = useRef<{
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
        target: THREE.Vector3;
    } | null>(null);
    const fitView = useRef<() => void>(() => {});

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) {
            return;
        }
        const { samples, stock, moves, stl, mode, alignment } = preview;
        const from = animated.current;
        const target = {
            length: stock.length,
            diameter: stock.diameter,
            alignment,
        };
        let started: number | null = null;
        let needsSideFrame = true;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(
            darkMode ? DARK_CANVAS_THEME.bg : LIGHT_CANVAS_THEME.bg,
        );
        let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera =
            savedView.current?.camera?.clone() ??
            new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 5000);
        const aspect = () =>
            (mount.clientWidth || 400) / (mount.clientHeight || 440);
        const ren =
            rendererRef.current ?? new THREE.WebGLRenderer({ antialias: true });
        rendererRef.current = ren;
        mount.appendChild(ren.domElement);
        const ctl = new OrbitControls(cam, ren.domElement);
        const perspectiveView = () => {
            if (!(cam instanceof THREE.PerspectiveCamera)) {
                cam = new THREE.PerspectiveCamera(40, aspect(), 0.5, 5000);
                ctl.object = cam;
            }
            return cam;
        };
        const fit = () => {
            followSideView.current = false;
            const camera = perspectiveView();
            const view = rotaryViewFit(
                stock.length,
                stock.diameter,
                camera.aspect,
            );
            ctl.target.set(view.centerX, 0, 0);
            camera.position
                .copy(ctl.target)
                .add(
                    new THREE.Vector3(-0.35, 0.6, 1)
                        .normalize()
                        .multiplyScalar(view.distance),
                );
            ctl.update();
        };
        const frameSide = () => {
            if (!(cam instanceof THREE.OrthographicCamera)) return;
            const pose = animated.current;
            const box = new THREE.Box3(
                new THREE.Vector3(0, -pose.diameter / 2, 0),
                new THREE.Vector3(pose.length, pose.diameter / 2, 0),
            );
            if (machineRef.current?.visible) {
                // Fit the end assemblies; the long track may extend offscreen.
                machineRef.current.traverse((object) => {
                    if (
                        object.userData.rotaryRole === 'tailstock' ||
                        object.name.startsWith('Headstock_Assembly') ||
                        object.name.startsWith('Headstock Assembly')
                    )
                        box.expandByObject(object);
                });
                const machineBox = new THREE.Box3().setFromObject(
                    machineRef.current,
                );
                box.min.y = Math.min(box.min.y, machineBox.min.y);
            }
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const halfHeight =
                Math.max(size.y / 2, size.x / (2 * aspect()), 1) * 1.16;
            cam.left = -halfHeight * aspect();
            cam.right = halfHeight * aspect();
            cam.top = halfHeight;
            cam.bottom = -halfHeight;
            cam.zoom = 1;
            ctl.target.copy(center);
            cam.position.copy(center).add(new THREE.Vector3(0, 0, 1000));
            cam.lookAt(center);
            cam.updateProjectionMatrix();
        };
        const side = () => {
            followSideView.current = true;
            cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 5000);
            ctl.object = cam;
            frameSide();
            ctl.update();
        };
        ctl.addEventListener('start', () => {
            followSideView.current = false;
        });
        sideView.current = side;
        fitView.current = fit;
        if (savedView.current) {
            ctl.target.copy(savedView.current.target);
        }
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(-30, 60, 40);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
        fill.position.set(40, -30, -40);
        scene.add(fill);
        scene.add(new THREE.AxesHelper(30));

        const partMat = new THREE.MeshStandardMaterial({
            color: 0xd9a066,
            roughness: 0.55,
            metalness: 0.05,
            side: THREE.DoubleSide,
        });
        const stockMat = new THREE.MeshStandardMaterial({
            color: 0x5aa9e6,
            transparent: true,
            opacity: 0.16,
            roughness: 0.9,
            metalness: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        let part: THREE.Mesh;
        if (mode === 'stl' && stl) {
            const g = new THREE.BufferGeometry();
            g.setAttribute(
                'position',
                new THREE.BufferAttribute(stl.positions, 3),
            );
            g.computeVertexNormals();
            part = new THREE.Mesh(g, partMat);
        } else {
            part = new THREE.Mesh(revolveGeometry(samples, 96), partMat);
        }
        scene.add(part);

        let stockMesh: THREE.Mesh | null = null;
        if (showStock) {
            stockMesh = new THREE.Mesh(stockGeometry(1, 1), stockMat);
            stockMesh.scale.set(
                from.length,
                from.diameter / 2,
                from.diameter / 2,
            );
            scene.add(stockMesh);
        }
        let alive = true;
        const fitMachine = () => {
            followSideView.current = false;
            if (!machineRef.current?.visible) {
                fit();
                return;
            }
            const box = new THREE.Box3().setFromObject(machineRef.current);
            box.expandByObject(part);
            if (stockMesh) box.expandByObject(stockMesh);
            const camera = perspectiveView();
            const view = machineViewFit(box, camera.aspect, camera.fov);
            ctl.target.copy(view.center);
            camera.position.copy(view.position);
            camera.far = Math.max(
                5000,
                view.distance + box.getSize(new THREE.Vector3()).length() * 2,
            );
            cam.updateProjectionMatrix();
            ctl.update();
        };
        fitMachineView.current = fitMachine;
        const addMachine = (root: THREE.Group) => {
            poseMachine(root, animated.current, animated.current.alignment);
            root.visible = visibleRef.current;
            machineRef.current = root;
            scene.add(root);
            needsSideFrame = true;
            setMachineStatus('');
        };
        if (machineRef.current) addMachine(machineRef.current);
        else
            new GLTFLoader().load(
                `${import.meta.env.BASE_URL}models/rotary/vortex.glb`,
                (gltf) => {
                    if (!alive) {
                        disposeMachine(gltf.scene);
                        return;
                    }
                    const root = new THREE.Group();
                    gltf.scene.scale.setScalar(1000);
                    root.add(gltf.scene);
                    addMachine(root);
                },
                undefined,
                () => {
                    if (alive)
                        setMachineStatus(
                            'Machine model could not load. Reload to retry.',
                        );
                },
            );
        let pathLine: THREE.Line | null = null;
        if (showPath && moves.length) {
            const res: Array<{ x: number; z: number; a: number }> = [];
            let cx = 0;
            let cz = 0;
            let ca = 0;
            for (const m of moves) {
                cx = m.x ?? cx;
                cz = m.z ?? cz;
                ca = m.a ?? ca;
                res.push({ x: cx, z: cz, a: ca });
            }
            const P = (p: { x: number; z: number; a: number }) =>
                new THREE.Vector3(
                    p.x,
                    p.z * Math.cos((p.a * Math.PI) / 180),
                    p.z * Math.sin((p.a * Math.PI) / 180),
                );
            const pts = [P(res[0])];
            for (let i = 1; i < res.length; i++) {
                const a = res[i - 1];
                const b = res[i];
                const n = Math.min(
                    72,
                    Math.max(1, Math.ceil(Math.abs(b.a - a.a) / 5)),
                );
                for (let k = 1; k <= n; k++) {
                    const t = k / n;
                    pts.push(
                        P({
                            x: a.x + (b.x - a.x) * t,
                            z: a.z + (b.z - a.z) * t,
                            a: a.a + (b.a - a.a) * t,
                        }),
                    );
                }
            }
            pathLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: 0x4caf7d }),
            );
            scene.add(pathLine);
        }

        const resize = (): void => {
            needsSideFrame = true;
            const w = mount.clientWidth || 400;
            const h = mount.clientHeight || 440;
            ren.setSize(w, h);
            if (cam instanceof THREE.PerspectiveCamera) cam.aspect = w / h;
            else {
                const halfHeight = (cam.top - cam.bottom) / 2;
                cam.left = (-halfHeight * w) / h;
                cam.right = (halfHeight * w) / h;
            }
            cam.updateProjectionMatrix();
        };
        resize();
        if (!savedView.current?.camera) side();
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        const loop = (): void => {
            if (!alive) {
                return;
            }
            requestAnimationFrame(loop);
            if (animated.current !== target) {
                needsSideFrame = true;
                const pose = interpolateMachinePose(
                    from,
                    target,
                    started === null ? 0 : performance.now() - started,
                );
                animated.current = pose;
                if (machineRef.current)
                    poseMachine(machineRef.current, pose, pose.alignment);
                if (stockMesh)
                    stockMesh.scale.set(
                        pose.length,
                        pose.diameter / 2,
                        pose.diameter / 2,
                    );
            }
            ctl.update();
            if (followSideView.current && needsSideFrame) {
                frameSide();
                ctl.update();
                needsSideFrame = false;
            }
            ren.render(scene, cam);
            // Start after the first frame's GPU setup so it cannot consume the tween.
            started ??= performance.now();
        };
        loop();
        return () => {
            alive = false;
            savedView.current = {
                camera: cam.clone(),
                target: ctl.target.clone(),
            };
            observer.disconnect();
            ctl.dispose();
            machineRef.current?.removeFromParent();
            const materials = new Set<THREE.Material>();
            scene.traverse((o) => {
                const mesh = o as THREE.Mesh;
                if (mesh.geometry) {
                    mesh.geometry.dispose();
                }
                if (mesh.material)
                    for (const material of Array.isArray(mesh.material)
                        ? mesh.material
                        : [mesh.material])
                        materials.add(material);
            });
            materials.forEach((material) => material.dispose());
            mount.removeChild(ren.domElement);
        };
    }, [preview, showStock, showPath, showMachine, darkMode]);
    useEffect(
        () => () => {
            if (machineRef.current) disposeMachine(machineRef.current);
            machineRef.current = null;
            rendererRef.current?.dispose();
            rendererRef.current = null;
        },
        [],
    );

    return (
        <div className="rotary-viewport relative overflow-hidden">
            <div className="rotary-viewport-canvas relative">
                <div ref={mountRef} className="absolute inset-0" />
                <div
                    role="group"
                    aria-label="3D view controls"
                    className="absolute right-3 top-3 z-10 flex gap-1 rounded-xl border border-slate-300 bg-white/90 p-1 text-slate-600 dark:border-slate-600/60 dark:bg-slate-950/80 dark:text-slate-200 shadow-lg backdrop-blur"
                >
                    <button
                        type="button"
                        aria-label="Side-on stock view"
                        title="Side-on stock view"
                        onClick={() => sideView.current()}
                        className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-slate-200 hover:text-slate-950 active:bg-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:active:bg-slate-600"
                    >
                        <PanelTop size={20} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Fit part"
                        title="Fit part"
                        onClick={() => fitView.current()}
                        className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-slate-200 hover:text-slate-950 active:bg-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:active:bg-slate-600"
                    >
                        <Scan size={20} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Fit machine"
                        title="Fit machine"
                        onClick={() => fitMachineView.current()}
                        className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-slate-200 hover:text-slate-950 active:bg-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:active:bg-slate-600"
                    >
                        <Box size={20} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Machine alignment"
                        title="Machine alignment"
                        aria-expanded={alignmentOpen}
                        aria-controls="rotary-machine-alignment"
                        onClick={() => setAlignmentOpen((open) => !open)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                        <Settings2 size={20} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {machineStatus && (
                <p role="status" className="px-3 py-1 text-xs text-slate-500">
                    {machineStatus}
                </p>
            )}
            {alignmentOpen && (
                <section
                    id="rotary-machine-alignment"
                    role="dialog"
                    aria-label="Machine alignment"
                    className="absolute inset-x-3 top-16 z-20 max-h-[calc(100%-5rem)] overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-xl dark:border-robin-700 dark:bg-dark"
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setAlignmentOpen(false);
                    }}
                >
                    <div className="flex items-center justify-between border-b px-3 dark:border-robin-900">
                        <h3 className="text-sm font-medium">
                            Machine alignment
                        </h3>
                        <button
                            type="button"
                            aria-label="Close machine alignment"
                            onClick={() => setAlignmentOpen(false)}
                            className="flex h-11 w-11 items-center justify-center"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <MachineAlignmentControls
                        value={alignment}
                        onChange={setAlignment}
                    />
                </section>
            )}
        </div>
    );
}
