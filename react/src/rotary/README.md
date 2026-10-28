# Rotary (Vortex) workflow

The Rotary sidebar tab opens one page with a 3D preview and profile/STL editor
in one card, and a persistent toolpath settings sidebar on the right. Machine
configuration and material use the same application settings as the main workflow.
Job Stock in the right sidebar groups rotary length, diameter and material,
using the same field styling as the main job stock card.

## Workspace

### Stock supports

Enable **Keep stock supports** to leave a continuous axial core and cylindrical
supports at both stock ends. Set the core and end diameters, and how far each
end support overlaps the part. Supports appear orange in the profile and 3D
previews. Their diameters are minimum remaining material; unmachined stock
outside the model may remain larger.

Support protection applies to the whole job, including profile and STL paths,
facing and grooves. It checks the cutter envelope over complete motion segments
and preserves inverse-time feed limits after raising a path. Part-off is blocked
while supports are enabled. Remove the supports and finish their attachment
points manually after machining. Choose dimensions for the material, overhang
and cutting load; the software does not calculate support strength. An off-axis
or disconnected STL may need additional bridges to connect every feature.

New jobs start with supports enabled. Older projects retain their saved setup;
enable supports explicitly when opening a project without support settings.

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

- **Profile**: a drawn radius-vs-X spline defines the part. Flat/straight-ball
  roughing and finishing use the same Around stock, Along stock and Helix
  generator as STL, including cutter compensation, guarded feed segments and G93
  timing. Along stock makes continuous X/Z passes at closely spaced A positions;
  it does not plunge at four indexed sides. Helix is finishing-only. Older
  0-degree/270-degree profile settings migrate to Along/Around respectively.
- **STL**: original mesh triangles are used. Around stock, Along stock and Helix
  are centreline XZA rotary patterns; Indexed sides provides XYZ+A. Editing a profile
  point switches explicitly back to profile turning.

## Independent XYZA mesh setup

Automatic orientation uses the longest side; model details allow a source-axis
override. Confirm source units before import. Source triangles are retained; the fitted silhouette is
only available for deliberate profile editing, never for STL cutting.

Pick a straight flat or ball tool for rotary roughing and finishing. Indexed
roughing currently requires a flat tool.
Tool selection, operation changes and finish tolerance changes supply mesh cell
size and stepover automatically. Mesh controls and fixture clearances are under
Advanced machining settings; normal use does not require editing them.
Shank and holder diameters are optional (zero means unspecified); supplied
diameters increase the fixture exclusion distance. Mesh machining assumes
independent X, Y, Z and A axes.
Choosing a different cutter resets shank/stickout measurements; the shared tool
library supplies its cutting length where available.

Normal rotary machining uses original STL triangles and exact face/edge/vertex
contact for vertical flat and ball cutters, with Y held on the rotary centreline.
Around stock makes full A turns then steps X; Along stock cuts X then steps A;
Helix continuously advances X and A and is available for finishing. Roughing
uses depth layers and a three-dimensional allowance. Around stock is the default.
For every linear command, midpoint cutter inflation bounds both the translation
and the rotation of every material point. Both command endpoints are raised to
clear that envelope, protecting the complete segment rather than just samples.
The model may extend below the centreline; contact Z is not clamped to zero.
Overhangs are approached from above; material under them is left in place.

Indexed sides remains a separate XYZ+A option using the shared XYZ triangle-cell
and clearing core. Old simultaneous ribbon projects are retained as a legacy
strategy, not presented as the normal rotary path. Machine Y is transverse and
Z is up; the preview transforms all commanded axes into material coordinates.

A worker calculates both profile and STL toolpaths, debounces requests, terminates
obsolete work and rejects stale results. Saving an unchanged preview reuses its
moves. Profile splines are sampled adaptively in the worker to a 0.005 mm bound;
that bound is included in cutter inflation. Profile square/pommel ranges protect
the cutter's full footprint and split paths with safe retractions.
Both fixtures use the configured cutter/shaft/holder width plus clearance. The
default profile blank is 110 mm long, leaving space at the tailstock for the sample.
Adjacent operations retain equivalent A angles without a multi-turn unwind;
standalone exports normalize their own A origin.
Mixed rotary/linear feed blocks use G93 with a conservative swept-distance time
bound and the configured rotary rate limit; G94 is restored afterwards. Mesh
and profile programs do not reset X to the chuck at the end of an operation.
Configured safe clearance is retained for parking and final retraction.

Known fixture overlap, open/nonmanifold or malformed meshes and resource overruns
block output. A missing mesh after project restore stays in STL mode and blocks
machining until reimported. Undo retains up to four recently imported meshes
in session; evicted meshes require reimport. No silent turning-envelope fallback
is allowed.

Limits: 100,000 triangles / 20 MB STL; 2 million contact queries for rotary paths;
500,000 moves; 90-second worker deadline. Indexed/legacy strategies additionally
limit raster samples and residual comparisons. Increase stepover, use a coarser
finish quality or split/simplify the model when these limits are reached. Taper/V-bit,
mesh facing/groove/part-off and pommel exclusions are not supported. Positive
stock capacity is required. Flute length and stickout do not block planning;
shank and holder collisions along the cutting surface are not checked. Attachment end
faces are excluded. Indexed/legacy visibility and residual diagnostics warn about
remaining material; detected gouges block those paths. Rotary paths use the
analytic swept cutter clearance bound described above.

Visibility and residual tests are sampled diagnostics, not a proof of complete
removal on arbitrary geometry. The current Simulation view is a transformed
path preview, not a volumetric rotary stock-removal simulator. These paths have
not been tested on a live machine. Verify physical zeroing, actual tool/fixture
geometry and the program before machining.

Run `node scripts/generate-rotary-fixtures.mjs` to reproduce the asymmetric flat
box and faceted boss/pocket STLs in `cypress/fixtures/`. Geometry, path, post,
worker lifecycle and browser tests cover rotary patterns and indexed machining.


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
