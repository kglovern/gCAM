# Rotary machine preview

`vortex.glb` was converted locally from the supplied Onshape AP242 assembly (`assembly (2).step`). No STEP parser is shipped to the browser.

- GLB uses metres; the viewport scales it to millimetres.
- X follows the spindle toward the tailstock. Y is up in the Three.js scene.
- Origin is the spindle centre on the chuck housing front face. Stock starts at this face and extends along +X; the jaws overlap its first 15.8 mm.
- All 24 tailstock meshes move together, with the live centre tip at stock length.
- Each of the four jaws retains its CAD slide direction. Its inward contact plane follows stock radius.
- Temporary alignment changes affect the preview only, are saved in browser local storage, and can be downloaded as JSON. They do not change G-code or collision checks.
- This is the fixed track supplied in the CAD; the extended-track option does not lengthen this mesh.

To regenerate, install `occt-import-js@0.0.23` into a temporary directory, then run from the repository root:

```powershell
node react/scripts/convert-rotary-machine.cjs "path/to/assembly.step" react/public/models/rotary/vortex.glb "path/to/temp/node_modules/occt-import-js"
```

Conversion uses 0.3 mm linear and 0.35 rad angular tessellation deflection. The converter checks for four jaws and one tailstock. Geometry tests check the resulting GLB contact positions against different stock sizes.
