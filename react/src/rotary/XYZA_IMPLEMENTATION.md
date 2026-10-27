# Mesh-based XYZA rotary machining

## Contract

The spline workflow remains a turning/envelope workflow. STL roughing and finishing use the original triangles, never the fitted turning silhouette. Normal rotary machining holds Y on the centreline and drives XZA; Indexed sides retains transverse Y and fixed-A XYZ machining. A rotates the stock around machine X. No claim of arbitrary STL reachability or machine safety without a specified setup and verification.

## Shared geometry

Normal rotary paths use `rotaryContact.ts`: analytic ball/flat contact maxima on triangle faces, edges and vertices, accelerated by an axial triangle index. `rotaryPaths.ts` builds Around stock, Along stock and Helix paths. Each command's midpoint cutter is inflated by half its axial travel plus half the maximum material arc travel. Raising both endpoints to that contact envelope protects all intermediate poses. Roughing adds uniform cutter inflation/vertical allowance and bounded depth layers. Helix is finishing-only. Contact may be below Z=0 for off-centre geometry; overhangs leave inaccessible material.

Indexed and legacy paths reuse `engine/surface-cam.ts`: conservative triangle-cell maxima, flat/ball tip contact, raster scan ordering and clearing depth levels. Keep CAM axes separate from Three.js (viewer Y is machine Z, viewer Z is machine Y). Ball tip coordinates are used throughout; do not add the old turning-envelope compensation a second time.

## Implementation sequence

1. **Coordinate and input foundation:** common rotation transforms; closed, finite, nondegenerate mesh validation; asymmetric watertight STL regression generator; tests at cardinal and arbitrary angles. Block the old STL envelope export while replacing it.
2. **Indexed mesh rough/finish:** worker-based, cancellable planning on transformed triangles using the existing cutter envelopes. Cylinder stock limits, explicit setup angles, conservative links, positive resolution/stepover/depth constraints, bounded memory and move counts. Never route a link through the stock when crossing a disconnected region.
3. **Continuous XYZA:** explicit simultaneous strategy with X/Y/A variation; segment collision checks over the entire angular sweep, not endpoints alone. Conservative swept triangle envelopes with a bounded rotation approximation error and adaptive subdivision. Retract at limits and unwinds. Retain indexed as a separate user choice.
4. **Post and preview:** Y modal moves, machine-relative material coordinates, correct signed A convention, G93 feed for blended linear/rotary moves and G94 restoration. Per-block inverse time includes rotary swept distance. Do not reset X/Y/A at unsafe height. Preview interpolates every commanded axis using the same transform. Never label a static wrapped path a removal simulation.
5. **Setup and reachability:** independent XYZA axes assumed; optional shank/holder diameters increase axial chuck/tailstock exclusions. No blanket full-radius flute-length or stickout requirement. Shank/holder collisions along cutting surfaces are not checked. Unsupported tools, invalid/open meshes, sampled gouges and exhausted resource limits fail clearly. Unreachable regions and remaining material warn while retaining the conservative upper-envelope finishing pass. A sampled visibility check cannot be described as proof of reachability.
6. **Integration:** persist parameters per operation; shared tool library and cutting recipes; stale/cancelled jobs cannot export; project restore invalidates missing mesh; only saved entries feed Simulation and export.

## Acceptance and regression evidence

- A box retains planar faces rather than its circumscribed cylinder; an off-axis protrusion changes contact at different A angles.
- A deterministic fixture combines unequal rectangular sections, an offset boss, a pocket and a concave/occluded feature. Store generated STL for CI and manual loading.
- Transform round trips and A sign; angle seam/winding; finite G-code; modal Y; G93 per-feed timing and G94 restore; retract before rotary indexing or lateral links.
- Compare flat and ball contact against analytic planes/boxes, and compare sampled output against triangles with an independent collision oracle. Check segment interiors and angular sweeps, including long tools and fixture exclusions.
- Roughing depth, allowance, final-pass coverage, bounded approximation error and residual stock are checked separately. Passing non-gouge tests does not prove complete material removal.
- Browser tests cover STL load, strategy/settings, saved operations, cancellation/stale export and four-axis preview. No live machine run without the operator validating the actual setup.

## Controller references

- grblHAL core supports G93/G94: https://github.com/grblHAL/core
- Sienci distinguishes independent 4th Axis Mode from Y-to-A Rotary Mode: https://resources.sienci.com/view/vx-quick_start_guide/

## Current implementation status

Implemented: original-triangle Around stock and Along stock roughing/finishing; continuous Helix finishing; separate Indexed sides and backward-compatible legacy ribbon paths; exact triangle cutter contact and conservative full-segment inflation for rotary paths; shared XYZ raster core for indexed paths; G93 timing/Y post; cutting-only transformed preview; saved settings and tool geometry; cancellable worker with stale-result gating; finite/manifold/capacity/fixture/resource checks; generated asymmetric fixtures, actual queen regression and analytic geometry tests. Identical saved-job and draft operations reuse one worker calculation.

Remaining validation scope: actual machine runs, complete volumetric remaining-stock simulation, all-surface reachability certification, self-intersection repair, and larger-job acceleration. Tapered cutters and shank/holder collisions against the cutting surface are not implemented. No arbitrary-model/foolproof guarantee is claimed.
