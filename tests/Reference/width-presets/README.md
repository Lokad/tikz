# Native width-preset measurements

Trusted input: [`width-presets.tikz`](../../Fixtures/width-presets.tikz).
PGF 3.1.11a / MiKTeX 25.4 / dvisvgm 3.4.3 / pdftoppm 24.04.0 generate the
native soft-path, SVG, ordinary PDF and registered 96/384-DPI page evidence.
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

The comparison currently reports **mismatch**: numeric and exact primary SVG
checks pass, but the existing PDF raster gate fails equally for the native SVG
and converter output. Converter-free calibration also fails that gate. Native
SVG and PDF vector pen widths agree on all fourteen paths. Image admission is
pending; this case remains required and its failure must not be hidden.

Explicit native regeneration and converter-free investigation are separate:

```text
dotnet run --project tools/TikzReference -c Release -- generate-reference --case width-presets
dotnet run --project tools/TikzReference -c Release -- calibrate-reference --case width-presets --out artifacts/calibration/width-presets
```

Only this trusted repository source may enter the native engine. Do not change
frozen policies, regenerate other fixtures or use converter output to select
allowances. The new width corpus does not establish general TikZ/PDF conformance.
