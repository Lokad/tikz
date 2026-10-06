# Independent straight-edge operation diagnostics

These development tools investigate differences between the original PGF SVG
and independent SVG encodings of the frozen native evidence. They invoke no
converter, TeX or PDF process. They require .NET 10, Node and the pinned
development Playwright/Chromium installation.

```text
node tools/TikzVisual/edge-operation-self-test.mjs
node tools/TikzVisual/inspect-edge-operations.mjs
```

The inspection owns a fresh framework-only native glyph-reader run. It retains
all five fixed fixtures, their physical paint order, ninety paints and sixteen
glyphs. Construction path IDs remain separate from physical paint ordinals.
Each drawing operation is isolated by removing other drawing elements while
preserving its ancestors, inherited paint, clipping, glyph definitions, root
dimensions and full native camera. Isolation does not fit an image to its ink.

Three native representations compare short TeX-point paths, six-place CSS
paths, and the original driver's finite scale/translation arithmetic. The last
uses the recorded driver origin, `0.996264` scalar and explicit bp-to-CSS
normalization; it performs no alignment search. Glyphs retain independent
native positions and original outline definitions. Clip geometry stays directly
inside `clipPath`, with its transformation on the graphics element.

The complete run saves fifteen full SVGs and 636 isolated SVGs. It observes
ninety whole-picture and 1,908 isolated pairs at 1x/4x over transparent, white
and black backgrounds. Every declared path, endpoint and glyph region is
measured. Both inputs repeat exactly. Each view retains reference/actual PNGs,
raw/alpha/amplified differences and overlays, plus one selected paired crop;
white 1x views also retain contact sheets. Crop selection affects presentation
only. `report.json` gives direct image paths, target identities and measurements;
`index.html` is a static gallery of full pairs and differing isolated 4x crops.

After successful inspection, explicitly select that run for saved-image checking:

```powershell
$edgeOperationRun = Get-Content artifacts/edge-operation-inspection/latest.json -Raw | ConvertFrom-Json
if (-not $edgeOperationRun.completed) { throw 'Native operation inspection is incomplete.' }
node tools/TikzVisual/check-edge-operations.mjs ('artifacts/edge-operation-inspection/' + $edgeOperationRun.report)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

The checker recovers native glyphs afresh and validates native inputs, source
and artifact hashes, renderer
identity, fixed cameras, operation identities and complete view/region coverage.
It reconstructs all 651 SVGs from native evidence and separately re-decodes the
saved reference/actual PNGs to reproduce their reported measurements. It
rejects corrupted report roles, coverage, registration, repeats and links.
Each command writes a fresh GUID directory; incomplete reports remain visible.
A completed integrity check grants no image allowance or converter conformance.

The controls require visible foreground in an unchanged clipped-line pair,
as well as exact repeated pixels. This detects a blank-versus-blank result
that repeatability alone would accept. The initial experiment with groups
inside a clip path produced blank clipped ink in the pinned browser; its
observations and the later failing visibility control remain preserved.

Current observations distinguish transform arithmetic from semantic losses.
The driver-frame representation removes several thin-stroke differences and
leaves small node/glyph edge differences. The original SVG still omits the
blue zero-length round-cap dot that native geometry and ordinary PDF retain.
The isolated dot has zero original-SVG foreground and nonzero native foreground.
This backend disagreement remains explicit, rather than becoming a raster
tolerance. Primary/PDF calibration, image-only defect sensitivity and a fresh
public-converter combined trial remain required before image admission.
