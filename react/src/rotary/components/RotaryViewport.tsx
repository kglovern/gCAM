/**
 * Purpose: Rotary 3D viewport — one view whose content follows the mode:
 * conversational revolves the drawn profile, STL shows the mesh triangles.
 * Toolpath plots tool centers (= G-code), stock is translucent, no mesh lines.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { rotaryViewFit } from './viewportFit';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
    what: string;
}

export function RotaryViewport({
    samples,
    stock,
    moves,
    showStock,
    showPath,
    stl,
    mode,
    what,
}: RotaryViewportProps): ReactElement {
    const mountRef = useRef<HTMLDivElement>(null);
    const savedView = useRef<{
        position: THREE.Vector3;
        target: THREE.Vector3;
    } | null>(null);
    const fitView = useRef<() => void>(() => {});

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) {
            return;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0f14);
        const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
        cam.position.set(-40, 55, 85);
        const ren = new THREE.WebGLRenderer({ antialias: true });
        mount.appendChild(ren.domElement);
        const ctl = new OrbitControls(cam, ren.domElement);
        const fit = () => {
            const view = rotaryViewFit(
                stock.length,
                stock.diameter,
                cam.aspect,
            );
            ctl.target.set(view.centerX, 0, 0);
            cam.position
                .copy(ctl.target)
                .add(
                    new THREE.Vector3(-0.35, 0.6, 1)
                        .normalize()
                        .multiplyScalar(view.distance),
                );
            ctl.update();
        };
        fitView.current = fit;
        if (savedView.current) {
            cam.position.copy(savedView.current.position);
            ctl.target.copy(savedView.current.target);
        }
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(-30, 60, 40);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
        fill.position.set(40, -30, -40);
        scene.add(fill);
        const grid = new THREE.GridHelper(400, 40, 0x2a3540, 0x1a222b);
        grid.position.y = -30;
        scene.add(grid);

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
        const chuckMat = new THREE.MeshStandardMaterial({
            color: 0x3a444e,
            roughness: 0.4,
            metalness: 0.8,
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
            stockMesh = new THREE.Mesh(
                stockGeometry(stock.length, stock.diameter / 2),
                stockMat,
            );
            scene.add(stockMesh);
        }
        const cg = new THREE.CylinderGeometry(20, 20, 18, 24);
        cg.rotateZ(Math.PI / 2);
        cg.translate(-9, 0, 0);
        const chuck = new THREE.Mesh(cg, chuckMat);
        scene.add(chuck);
        let tail: THREE.Mesh | null = null;
        if (stock.length - stock.grip > stock.diameter * 3) {
            const tg = new THREE.ConeGeometry(6, 18, 20);
            tg.rotateZ(-Math.PI / 2);
            tg.translate(stock.length + 9, 0, 0);
            tail = new THREE.Mesh(tg, chuckMat);
            scene.add(tail);
        }
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
            const w = mount.clientWidth || 400;
            const h = mount.clientHeight || 440;
            ren.setSize(w, h);
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
        };
        resize();
        if (!savedView.current) fit();
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        let alive = true;
        const loop = (): void => {
            if (!alive) {
                return;
            }
            requestAnimationFrame(loop);
            ctl.update();
            ren.render(scene, cam);
        };
        loop();
        return () => {
            alive = false;
            savedView.current = {
                position: cam.position.clone(),
                target: ctl.target.clone(),
            };
            observer.disconnect();
            ctl.dispose();
            scene.traverse((o) => {
                const mesh = o as THREE.Mesh;
                if (mesh.geometry) {
                    mesh.geometry.dispose();
                }
            });
            ren.dispose();
            mount.removeChild(ren.domElement);
        };
    }, [samples, stock, moves, showStock, showPath, stl, mode]);

    return (
        <div className="rotary-viewport overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-robin-900 dark:bg-dark">
            <div ref={mountRef} className="rotary-viewport-canvas" />
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-2.5 py-1.5 text-xs dark:border-robin-900">
                <button
                    type="button"
                    onClick={() => fitView.current()}
                    className="min-h-11 rounded-md border border-slate-300 px-3 dark:border-robin-700"
                >
                    Fit part
                </button>
                <span className="text-slate-500 dark:text-slate-400">
                    {what}
                </span>
                <span className="ml-auto text-slate-500 dark:text-slate-400">
                    drag to orbit · scroll to zoom
                </span>
            </div>
        </div>
    );
}
