# Grounding against TikZ

The initial required corpus contains `line-units`: named coordinates, physical
units, `scale=2`, an unscaled 2 TeX pt stroke, an xcolor mixture, and opacity.
Other converter geometry is still under development and is not covered by this
initial fidelity claim. Extend the independent corpus with each feature.

## Ordinary .NET tests

```text
dotnet test Lokad.TikZ.slnx
```

These tests consume checked-in PGF measurements and need neither TeX nor a
browser. They cover physical measurements, error behavior, limits,
cancellation, culture independence, and repeated/concurrent conversion.

## Cached visual conformance

Install the pinned development-only browser tooling once:

```text
npm ci --prefix tools/TikzVisual --ignore-scripts
npm exec --prefix tools/TikzVisual -- playwright install chromium
```

Then compare every required case and exercise the comparator itself:

```text
dotnet run --project tools/TikzReference -- compare --reference cached --out artifacts/comparisons
npm test --prefix tools/TikzVisual
```

Run one focused case with:

```text
dotnet run --project tools/TikzReference -- compare --case line-units --reference cached --out artifacts/comparisons/line-units
```

Both SVGs are rerendered in the same pinned Chromium process at 1x and 4x.
The initial primary profile requires exact pixels, including alpha and fixed
light/dark backgrounds. Coordinate registration uses the measured physical
origin; images are never fitted or automatically aligned. Native dimensions
are checked separately. Missing tools, incompatible manifests, and missing
reference artifacts fail instead of skipping a case.

The cached baseline also includes ordinary pdfLaTeX output rasterized by
Poppler 24.04.0 at 96 and 384 DPI. Cached comparison needs no PDF rasterizer.
The PDF cross-check has its own [calibrated antialiasing bounds](../tools/TikzVisual/CALIBRATION.md).
Reports include candidate-versus-PDF and oracle-SVG-versus-PDF measurements.

Exit codes are `0` for pass, `1` for a semantic/rendering mismatch, `2` for a
harness failure, and `3` for candidate conversion failure or unsupported
coverage. Every nonzero category fails required CI cases. Output directories
are owned by the harness, reset on comparison, and must be inside `artifacts/`.
The suite manifest lists expected and executed cases.

## Inspect a result

Read `artifacts/comparisons/<case>/report.json` first. Open `comparison.png`
to inspect the reference, actual output, and amplified difference, then open
the highest-ranked paired crops. `index.html` supplies common-camera zoom,
blink, and opacity controls. Region links jump to attributed source lines.
Attribution through geometric intersection is labeled as heuristic.

The bundle retains source, original SVGs, 1x/4x PNGs, raw/amplified differences,
overlay, numeric deltas, scene trace, oracle logs, and provenance. Reports
hash their artifacts and record browser identity and rendering settings.
Candidate provenance records its assembly hash, commit, working-tree
fingerprint, build configuration, and options. Fix the implicated compiler
stage, rerun the focused case, and then run the corpus. Do not change an
expected reference or loosen a threshold to hide a candidate defect.

The self-test requires a passing `line-units` bundle. It repeats unchanged
pairs, mutates geometry/units/stroke/color/opacity/clipping/canvas size, removes
or adds drawing, and tests mostly blank canvases. Synthetic outlined glyph,
minus, baseline, and arrowhead mutations test the comparator; they make no
claim that the converter already supports those features. Adversarial source
is never sent to TeX.

## Explicit live reference generation

Only trusted repository fixtures from `tests/Reference/cases.json` are accepted.
The initial wrapper/probes are deliberately specific to `line-units` and must
be extended when new semantic quantities are introduced.

```text
dotnet run --project tools/TikzReference -- generate-reference --case line-units
```

This explicit command writes the checked-in baseline directory. Ordinary
comparison has no baseline-write mode. Review baseline changes and their
provenance before committing them. The pinned versions are declared in
`tests/Reference/oracle-profile.json`; executable and TeX input hashes are
recorded for each generation. Shell escape and automatic package installation
are disabled; process output and execution time are bounded. Those switches
do not make TeX safe for arbitrary submitted diagrams.

Generation compares instrumented and uninstrumented SVGs byte for byte and
checks their TeX box dimensions. The separate ordinary PDF driver supplies
measured page positions for its registration. Fixtures, wrappers, measurements,
and tool profiles have hashes; modified cached artifacts are rejected.
