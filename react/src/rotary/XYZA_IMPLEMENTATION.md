# Mesh-based XYZA rotary machining

## Contract

The spline workflow remains a turning/envelope workflow. STL roughing and finishing must use the original triangles, never the fitted turning silhouette. Y stays an independent linear axis; A rotates the stock around machine X. Outputs must identify indexed XYZ+A versus simultaneous XYZA. No claim of arbitrary STL reachability or machine safety without a specified setup and verification.

## Shared geometry

Reuse `engine/surface-cam.ts`: conservative triangle-cell maxima, flat/ball tip contact, raster scan ordering and clearing depth levels. Rotate the baked STL into machine XYZ for each A setup. Keep CAM axes separate from Three.js (viewer Y is machine Z, viewer Z is machine Y). One transform and its inverse are used by sampling, segment validation, fixture checks and preview. Ball tip coordinates are used throughout; do not add the old turning-envelope compensation a second time.

## Implementation sequence

1. **Coordinate and input foundation:** common rotation transforms; closed, finite, nondegenerate mesh validation; asymmetric watertight STL regression generator; tests at cardinal and arbitrary angles. Block the old STL envelope export while replacing it.
2. **Indexed mesh rough/finish:** worker-based, cancellable planning on transformed triangles using the existing cutter envelopes. Cylinder stock limits, explicit setup angles, conservative links, positive resolution/stepover/depth constraints, bounded memory and move counts. Never route a link through the stock when crossing a disconnected region.
3. **Continuous XYZA:** explicit simultaneous strategy with X/Y/A variation; segment collision checks over the entire angular sweep, not endpoints alone. Conservative swept triangle envelopes with a bounded rotation approximation error and adaptive subdivision. Retract at limits and unwinds. Retain indexed as a separate user choice.
4. **Post and preview:** Y modal moves, machine-relative material coordinates, correct signed A convention, G93 feed for blended linear/rotary moves and G94 restoration. Per-block inverse time includes rotary swept distance. Do not reset X/Y/A at unsafe height. Preview interpolates every commanded axis using the same transform. Never label a static wrapped path a removal simulation.
5. **Setup and reachability:** independent-A capability confirmation; flute/shank/holder dimensions; axial chuck/tailstock exclusions and rail clearance; collision rejection, residual/unreachable-region reporting, and explicit export gating. Unknown or unsupported tools, invalid/open meshes, missing setup and exhausted resource limits fail clearly. A sampled visibility check cannot be described as proof of reachability.
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

Implemented: original-triangle indexed rough/finish and local-sweep simultaneous finishing; common coordinate transforms; shared XYZ cutter contact and clearing; G93 timing/Y post; cutting-only transformed preview; per-operation settings and tool geometry; cancellable worker with stale-result gating; finite/manifold/capacity/fixture/resource checks; sampled visibility and independent residual probes; source-axis/centering and missing-mesh export blocking; generated STL fixtures and automated tests.

Remaining validation scope: actual machine runs, complete volumetric remaining-stock simulation, exact all-surface reachability certification, self-intersection repair, and GPU acceleration for larger jobs. No arbitrary-model/foolproof guarantee is claimed. Simultaneous roughing remains unsupported; use indexed roughing followed by simultaneous finishing.
