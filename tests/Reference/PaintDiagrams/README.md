# Paint in a complete diagram

The fixed [flowchart](../../Fixtures/Diagrams/flowchart-paint.tikz) combines
four positioned rectangle nodes, five attached labels and arrow tips, calculated
coordinates, an orthogonal return, named/mixed RGB colors, separate fill/stroke/
text opacity, dash patterns/phase, round caps/joins and visible clipping of a
curved shaft and glyph. It uses the bundled Latin Modern EC 10pt profile.

`image-profile.json` pins the byte-preserving native evidence archive and its
shared transport dependencies. The archive contains the completed native-only
primary calibration/check and separate PDF calibration/check reports, including
their original drawings, glyph observations, cameras, regions, policies, source
captures and controlled defects. It contains no current converter acceptance.
Older family archives and native calibration stay unchanged.

The primary calibration has three fixed encodings, two capture routes, 72 native
views and 39 sensitivity controls. Two controls remove the clip independently
from a shaft and glyph; both must visibly fail at white 1x/4x through both routes
with numeric checks bypassed. The PDF policies remain separate from SVG policies.
Pixel equality with the original native driver is not assumed.

The existing [cache reader](../../../tools/TikzVisual/path-label-cache.mjs),
[materializer](../../../tools/TikzVisual/materialize-path-label-cache.mjs) and
[shared corruption controls](../../../tools/TikzVisual/path-label-cache-self-test.mjs)
validate/restore these owned bytes without running TeX or the converter:

```powershell
node tools/TikzVisual/materialize-path-label-cache.mjs flowchart-paint
node tools/TikzVisual/path-label-cache-self-test.mjs
```

Current conformance requires fresh public converter output, independent numeric
and image checks, both PDF gates and final-source integration. Portable native
evidence alone does not establish it. The production assembly has no dependency
on this archive or any reference-engine process.

This fixture sets route `color=` explicitly. The observed native backends can
disagree on an arrow's implicit fill when only `draw=` sets its color; that
behavior needs separate qualification and is outside this fixture's evidence.
