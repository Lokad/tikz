# Testing and native references

Run commands from the repository root. Use the .NET SDK selected by `global.json`.
Ordinary tests use committed fixtures and need no TeX, browser or installed fonts.

## Ordinary development

```text
dotnet test Lokad.TikZ.slnx
```

The suite checks supported syntax, explicit rejection, original UTF-16 diagnostic
spans, native geometry and label metrics, returned SVG, call isolation,
cancellation and shared resource limits. A passing scene comparison does not
replace checking the returned SVG: serialization can introduce its own defects.
Use a focused filter while editing, then run the full ordinary suite.

The fixed adversarial corpus adds malformed-input invariants, culture and
concurrency checks, and exact saved UTF-16 replay:

```text
node tools/TikzVisual/verify-adversarial.mjs
```

See [TikzAdversarial](../tools/TikzAdversarial/README.md) for its scope and controls.
Fixed inputs complement focused regressions; a corpus pass does not establish
correct handling of every parsing, layout and serialization interaction.

## Choose the required evidence

| Change | Validation |
| --- | --- |
| Parsing, evaluation or output behavior | Ordinary suite and focused regressions; affected native numeric/image comparisons |
| Geometry, text or paint | Affected current-output iteration, then required family admission and final qualification on the final source tree |
| Reference reader, cache or policy | Its positive/corruption controls and independent checker; preserve native evidence and renderer-specific policies |
| Packaging | Explicit Release pack, payload audit and isolated source/package consumers |
| Performance | Public/phase admission, then matched measurements of affected representative workloads |
| Documentation only | Check examples, commands and links; rerun changed executable examples |

The [verification guide](VERIFICATION.md) defines affected iteration, final
qualification and family dependencies. The [coverage index](VERIFICATION-COVERAGE.md)
explains the distinct observations. Push/PR CI runs Release build/tests and
package acceptance on Windows and Linux. The separate manual full-qualification
workflow contains broader reference and browser checks. Ordinary CI does not
establish that qualification.

## Current-output image checks

Install the development browser once:

```text
npm ci --prefix tools/TikzVisual --ignore-scripts
npm exec --prefix tools/TikzVisual -- playwright install chromium
```

Use the pinned Node, Playwright, browser and renderer environment recorded by
the selected reference profile. Installing a browser alone does not establish
compatibility with that profile. Comparisons check identities and preserve their
measured per-view pixel policies.

```text
node tools/TikzVisual/verify.mjs iterate --feature plots
node tools/TikzVisual/verify.mjs iterate --case flowchart-draw-color
node tools/TikzVisual/verify.mjs qualify
```

Iteration includes the ordinary suite and selected fresh conversions. The final
routine covers the complete diagram matrix, independent numeric/image checking
and retained controls. Selected-case qualification covers that case only.
Required family admissions remain additional checks when their dependencies
change. These commands neither regenerate native references nor invoke TeX.

Reports and galleries are written under ignored `artifacts/`. Keep the exact
report path and digest printed by the command for saved-report checking. Inspect
fresh candidate output before claiming conformance; historical converter images
cannot stand in for the current build.

## Reference tool index

Native measurements and raster policies belong to specific corpora. There is no
general pixel-identity claim across arbitrary TikZ inputs or renderers.

| Corpus | Evidence and comparison guides |
| --- | --- |
| Primitives, widths and rectangle nodes | [Widths](../tests/Reference/width-presets/README.md), [node measurements](../tools/TikzReference/NODE-BORDERS.md), [text](TEXT.md), [nodes](NODES.md) |
| Bundled fonts and math labels | [Font extraction/metrics](../tools/TikzFontData/README.md), [math-label evidence](../tests/Reference/MathLabels/README.md) |
| Circle/ellipse nodes | [Native reference](../tools/TikzShapeReference/README.md), [comparison](../tools/TikzShapeComparison/README.md), [PDF](../tools/TikzShapePdfReference/README.md), [calibration](../tools/TikzShapeCalibration/README.md) |
| Labelled borders | [Reference](../tools/TikzLabelledBorderReference/README.md), [reconstruction](../tools/TikzLabelledBorderOracle/README.md), [comparison](../tools/TikzLabelledBorderComparison/README.md) |
| Connections | [Straight reference](../tools/TikzEdgeReference/README.md), [comparison](../tools/TikzEdgeComparison/README.md), [curved reference](../tools/TikzCurvedEdgeReference/README.md), [curved comparison](../tools/TikzCurvedEdgeComparison/README.md) |
| Arrows | [Native reference](../tools/TikzArrowReference/README.md), [supported forms and fixed admission](ARROWS.md) |
| Dashes | [Line states](../tools/TikzDashReference/README.md), [path geometry](../tools/TikzDashGeometryReference/README.md), [comparison](../tools/TikzDashComparison/README.md), [semantics](DASHES.md) |
| Calculated coordinates | [Native reference and comparison](../tools/TikzCalcReference/README.md) |
| Attached labels and complete diagrams | [Reference](../tools/TikzPathLabelReference/README.md), [independent labels](../tools/TikzPathLabelOracle/README.md), [comparison](../tools/TikzPathLabelComparison/README.md), [diagrams](../tests/Fixtures/Diagrams/README.md) |

These guides distinguish native generation, cached integrity, candidate numeric
checks, inspection, calibration and admitted image policies. An old research
report may retain a pending verdict after a later fixed profile is admitted.
Use the current family admission for a current claim; old trials remain history.

## Live native work

Only trusted repository fixtures may enter the development TeX engine. Native
generation is explicit, separate from ordinary testing, and requires the exact
MiKTeX/PGF, fonts and backend tools named by the profile. Do not pass application
or user-supplied input to these tools.

Follow the selected native tool's instructions. Preserve raw output,
plain/probed invariance, independent page registration and separate original
and corrected SVG/PDF routes. Native evidence establishes a tolerance before
candidate comparison. Relevant input or policy changes require new reference
qualification; unchanged evidence can be reused.

## Packaging and performance

```text
dotnet pack src/Lokad.TikZ -c Release
node tools/TikzPackageCheck/verify.mjs artifacts/nuget --controls
```

Package acceptance audits the actual archive, .NET-only dependencies, API XML,
licenses and asset payload, then restores an isolated consumer and compares its
results with a source consumer. Debug packing is rejected.

The [benchmark project](../benchmarks/Lokad.TikZ.Benchmarks/README.md) supplies
public, phase, limit and cancellation probes. The [measurement contract](performance.md)
distinguishes warm throughput, allocation, first-use cost and process memory.
Timing observations apply to a particular build/workload and are not test gates.
