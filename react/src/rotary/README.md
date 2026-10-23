# Rotary (Vortex) workflow

The Rotary sidebar tab opens one page with a 3D preview and profile/STL editor
in one card, and a persistent toolpath settings sidebar on the right. Machine
configuration and material use the same application settings as the main workflow.
Job Stock in the right sidebar groups rotary length, diameter and material,
using the same field styling as the main job stock card.

## Workspace

The preview starts in orthographic side view; part and machine perspective fits
remain available. Stock, toolpath and machine visibility live in the header.
The gear button opens preview-only CAD alignment controls.

The profile editor uses one pixel-per-millimetre scale for both axes. Wheel zoom
anchors at the cursor; drag the background or use two fingers to pan and zoom.
Home resets the view. Profile/STL tabs sit on the left of the editor. Both editing
surfaces use the main canvas light/dark palette. Geometry stays in millimetres;
length and feed inputs follow the application's selected units.

Choose Facing, Roughing, Finishing, Groove or Part-off from the shared operation
picker (with rotary SVG illustrations). Pick a library tool, set operation-specific
parameters, then Add Toolpath. The job list supports edit/save/cancel, delete,
reorder and undo. Each entry keeps its own cutter, feeds, spindle and pass depth.
Only added entries are previewed in Simulation and included in Export/Send;
the editor previews the current draft without adding it to the job.
The export dropdown can save one entry. Part-off must be last.

Geometry, stock and pommel edits replan the saved operations against the current
part; changing a draft tool does not alter saved entries. Tool changes use the
same M6 convention as the main post, after retracting to park and stopping the
previous spindle. Project files retain the list; older checkbox-based projects
migrate to equivalent ordered entries.

Tool selection and suggested/manual cutting values reuse `ToolSelectionFields`
and `CuttingRecipeFields`. Rotary profiling uses the existing profile-outside
recipe with the configured machine, selected material and cutter. Applied values
are saved into rotary tool/operation state and used by generation. Older projects
without the suggestion flag retain their saved manual cutting values.

File and undo/redo controls use the main toolbar components at the top.
Export and Send reuse the main sidebar controls; G-code updates automatically
after a 400 ms pause in editing. G-code and the rotary
toolpath preview live on Simulation; switching back retains generation status.
The shared Send to gSender control uses the configured local handoff port.
Export and Send are enabled
only for current settings after regeneration completes with no blocking checks.

## Modes

- **Conversational**: drawn envelope IS the part, tooltip cuts at Z = r.
- **STL**: original mesh triangles are used. Indexed XYZ+A roughing and finishing
  and simultaneous XYZA finishing are separate strategies. Editing a profile
  point switches explicitly back to profile turning.

## Independent XYZA mesh setup

Select the source STL longitudinal axis and cross-section centring before import.
Units are millimetres. Source triangles are retained; the fitted silhouette is
only available for deliberate profile editing, never for STL cutting.

Pick a flat tool for indexed roughing, or a flat/ball tool for finishing. Enter
mesh cell size, stepover, A spacing, finish tolerance, measured flute length,
shank diameter, stickout, holder diameter and fixture clearances. Confirm that
Y and A are independent axes (Sienci 4th Axis Mode, not Y-to-A substitution).
Choosing a different cutter resets shank/stickout measurements; the shared tool
library supplies its cutting length where available.

The planner reuses the XYZ triangle-cell/cutter-contact core and clearing path
builder. Continuous finishing bounds each local angular sweep with triangle
convex hulls plus rotation sagitta. It does not wrap a turning silhouette around
the stock. Machine Y is transverse and Z is up; the preview transforms all four
axes back into material coordinates and displays cutting segments only.

A worker debounces requests, terminates obsolete work and rejects stale results.
Mixed rotary/linear feed blocks use G93 with a conservative swept-distance time
bound and the configured rotary rate limit; G94 is restored afterwards. Mesh
programs do not reset X to the chuck at the end of an operation.

Known fixture overlap, insufficient flute clearance, open/nonmanifold or malformed
meshes, unseen faces, excessive sampled finish residual and resource overruns
block output. A missing mesh after project restore stays in STL mode and blocks
machining until reimported. Undo retains up to four recently imported meshes
in session; evicted meshes require reimport. No silent turning-envelope fallback
is allowed.

Limits: 100,000 triangles / 20 MB STL; 4 million planning samples; 500,000 moves;
20 million residual comparisons; 90-second worker deadline. Increase cell size,
stepover or split/simplify the model when these limits are reached. Taper/V-bit,
mesh facing/groove/part-off and pommel exclusions are not supported. Positive
stock capacity and full-radius flute clearance are required. Attachment end
faces are excluded; occluded/undercut surfaces may require another setup.

Visibility and residual tests are sampled diagnostics, not a proof of complete
removal on arbitrary geometry. The current Simulation view is a transformed
path preview, not a volumetric rotary stock-removal simulator. These paths have
not been tested on a live machine. Verify physical zeroing, actual tool/fixture
geometry and the program before machining.

Run `node scripts/generate-rotary-fixtures.mjs` to reproduce the asymmetric flat
box and faceted boss/pocket STLs in `cypress/fixtures/`. Geometry, path, post,
worker lifecycle and browser tests cover both mesh strategies.


## Engine (`engine/`, pure TS, tested)

- `profileModel` — Bezier points (corner/smooth/sym), sampling,
  shorten-only handle repair, exact de Casteljau node insertion.
- `toolpath` — XZA rough (spiral peel per level-run), finish (helical
  zigzag 270° or indexed 0°), groove/part/facing. A oscillates within one
  turn; every entry retracts to Z-safe; pommel ranges are keep-out.
- `gcode` — Vortex A-axis GRBL post (shared `.nc` export): T1/G17/G21/G90,
  Z-zero at cylinder axis, A0 sync, A-range stamp, M5/M2.
- `checks` — stock/travel limits, grip, tailstock rule, tool fit, pommels.
- `stl` — binary+ASCII parse, silhouette, RDP fit, viewer baking.

Motion rules enforced by `toolpath.test.ts`: no chord-cutting feeds, feed
A-steps ≤ 90°, long rapids only at safe height, tooltip above envelope,
A ≤ 360°, pommel exclusion.

## Tooling

The rack reads the shared gCAM library (`loadSlots(localStorage)`). Supported
rotary library types are flat, ball/ballnose and V-bit cutters; configured tool
diameter/type and shared recommendations populate the rotary settings.

## Shared infrastructure (not duplicated)

- **Undo**: history stacks run on `lib/history.ts`, the same snapshot-stack
  utility as the 2.5D document. `useRotaryState` is lifted to `App`, so
  Ctrl+Z / Ctrl+Shift+Z / toolbar buttons dispatch to rotary while its tab
  is focused (2.5D delete/duplicate stay gated out).
- **Project files**: `.gcam.json` carries an opaque `rotary` slice
  (validated by `isRotaryProjectSlice`; mesh re-links by key). The
  top-menu Export/Import covers rotary — no separate JSON buttons.
