# Native width-preset measurements

Trusted input: [`width-presets.tikz`](../../Fixtures/width-presets.tikz).
PGF 3.1.11a / MiKTeX 25.4 / dvisvgm 3.4.3 / pdftoppm 24.04.0 generate the
native soft-path, SVG, ordinary PDF and registered 96/384-DPI page evidence.
This fixture explicitly records Poppler `-thinlinemode shape`; older fixtures
retain their default rasterizer flags. Null optional manifest fields are omitted
from serialization, preserving the older native case definitions.
`provenance.json` binds the source, wrapper, profile, case definition and every
asset. Probe-enabled and probe-free SVGs and picture boxes are identical.

The fourteen horizontal paths cover the seven thickness presets, both orders
of preset/explicit-width assignment, successive presets, inherited scope width,
ordered style expansion, scope restoration and a style selecting `ultra thin`.
The [width contract](../../../docs/WIDTHS.md) lists their exact native grid values.

Ordinary tests reuse the generic primitive/source checks and the existing emitted
SVG reader. One focused test converts the whole corpus once and compares all
fourteen scene/SVG widths and four picture bounds in integer sp. This is stricter
than the general numeric allowance, which is one sp in CSS pixels (0.000021px)
to accommodate TeX's printed shortest-roundtrip dimensions.

```text
dotnet test Lokad.TikZ.slnx
dotnet run --project tools/TikzReference -c Release -- compare --case width-presets --reference cached --out artifacts/comparisons/width-presets
```

The comparison uses the authenticated converter-free [`calibration.json`](calibration.json)
and [width policy](../../../tools/TikzVisual/width-profile.json). Primary SVG is
exact at both scales. PDF has separate native-derived 1x/4x bounds, with strict
component agreement at 4x; all fourteen native SVG/PDF vector pen widths also
agree. The [shared comparator controls](../../../tools/TikzVisual/self-test.mjs)
retain positive numeric evidence and independently reject width/content/position
defects through primary and PDF. There is no exact-PDF-pixel claim.

Explicit native regeneration and converter-free investigation are separate:

```text
dotnet run --project tools/TikzReference -c Release -- generate-reference --case width-presets
dotnet run --project tools/TikzReference -c Release -- calibrate-reference --case width-presets --out artifacts/calibration/width-presets
```

Only this trusted repository source may enter the native engine. Deliberate
precision variants correctly fail the exact primary policy while recording
their PDF measurements. Replacing the reviewed calibration/provenance pins is
a separate review step. Preserve older fixtures and policies; no candidate may
select allowances. This corpus does not establish general TikZ/PDF conformance.
