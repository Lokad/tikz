# Arrows

The converter supports one arrow tip at each end of a stroked path: legacy `To`,
the `arrows.meta` replacement for `To`, `Stealth`, and `Latex`.

```tex
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}
  \draw[-{Stealth[length=8pt,width=6pt,inset=2pt]}] (0,0)--(2,0);
  \draw[{Latex}-{Stealth},shorten >=2pt,shorten <=1pt] (0,1)--(2,1);
\end{tikzpicture}
```

`->`, `<-`, `<->`, `>=Latex`, `arrows=...`, and grouped start/end
specifications are accepted. `length` and `width` require positive physical
dimensions. `Stealth` accepts a nonnegative `inset` smaller than its length.
Explicit shortening accepts positive and negative physical dimensions.
Loading `arrows.meta` in source or `TikzOptions.Libraries` changes default `To`
from the legacy open curve to Computer Modern Rightarrow and enables modern
tips. Library definitions remain local to a conversion.

## Geometry and paint

Tip dimensions are physical. Scaling changes path endpoints and tangent;
tip dimensions and shaft pen width keep their physical sizes. Defaults and tip
pen clamping use the final effective shaft width, including deferred edge paint.
Tips reset dash array and phase, inherit stroke color as fill, and retain
applicable opacity and clips. Legacy and modern `To` use rounded caps/joins;
`Stealth` and `Latex` use finite filled outlines and miter joins.

Node borders and connection curves resolve before arrow lowering. End shortening
precedes start shortening. Native quick curve shortening moves endpoints along
their tangent and leaves controls in place. Degenerate controls fall back to
the next available point; zero directions use PGF's upward normalization.
Negative and excessive shortening preserve native behavior. Both tips belong
to the final subpath. A closed subpath suppresses normal tips and shortening.

Lowering emits an ordinary shaft followed by start/end tip paths, with source
spans, local geometry and finite transforms. Output uses no SVG markers.
Generated geometry shares the conversion's work limits and cancellation.

Multiple tips per side, bending/flex, reversed/harpoon/open/round variants,
custom declarations and other arrow libraries are unsupported. Unknown tips,
missing libraries, unsupported options and invalid dimensions diagnose
explicitly. This subset does not establish full PGF arrow compatibility.

## Native evidence and current validation

The six frozen glyph-free fixtures contain 118 physical paints and 59 placements.
Public scene and independently decoded SVG checks cover dimensions, shortening,
transforms, paint, clips, order and bounds. Plain and traced conversions must
agree. Numeric agreement and image fidelity are separate observations.

```text
node tools/TikzVisual/arrow-reference.mjs check-cached
dotnet run --project tools/TikzArrowComparison -c Release
node tools/TikzVisual/inspect-arrow-public.mjs
```

The first two commands need no native engine or browser. The inspector uses the
pinned development browser and retains paired views/crops, differences, source
attribution and a gallery under ignored `artifacts/`. See the
[native guide](../tools/TikzArrowReference/README.md) for controls, explicit live
generation and independent instruction readers.

The fixed admission owns a fresh converter trial and independently compiled
checker. Its immutable profile binds the corpus, native policy/frame hashes,
required baseline/control views and sixteen aggregate gates:

```text
node --max-old-space-size=4096 tools/TikzVisual/compare-arrow-conformance.mjs
node --max-old-space-size=4096 tools/TikzVisual/arrow-admission-self-test.mjs --report artifacts/arrow-conformance/run-<uuid>/report.json
node --max-old-space-size=4096 tools/TikzVisual/check-arrow-conformance.mjs artifacts/arrow-conformance/run-<uuid>/report.json
```

Use the producer's exact report path. Only a completed passing admission carries
an image conformance claim. Historical research reports keep pending verdicts.
The profile applies to its fixtures and renderer; broader and hosted
qualification remain separate. See [verification](VERIFICATION.md).

## Attached-label color correction in reference SVG

The pinned PGF SVG driver can omit automatic tip fill when an attached label
uses the same color as the stroke. It leaves the tip black while ordinary
pdfTeX fills it with the stroke color. The
[four-row fixture](../tests/Fixtures/Diagrams/arrow-color-contract.tikz) isolates
no-label, matching-label, different-label and explicit `color=` cases. The
converter emits the PDF-consistent teal tip in all four cases.

A [reference hook](../tools/TikzVisual/svg-arrow-color-workaround.mjs) reapplies
automatic tip fill during native generation for two pinned trusted fixtures:
that contract and the [complete flowchart](../tests/Fixtures/Diagrams/flowchart-draw-color.tikz).
Original/corrected SVG and unmodified PDF remain separate. Independent controls
require unchanged geometry, clips, glyphs, other paint and PDF pixels; only
declared default tip fills may change. An image-only black-tip mutation must
reject even with numeric checks bypassed.

The [frozen color evidence](../tests/Reference/ArrowColors/README.md) records
generation, calibration and scoped qualification. Live
`arrow-color-driver-self-test.mjs` is separate trusted reference work, not an
ordinary test or production fallback.
