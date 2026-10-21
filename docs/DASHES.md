# Dashes

Supported styles are `solid`, `dashed`, `dotted`, `dashdotted` and
`dashdotdotted`, their dense/loose variants and corresponding spaced aliases.
Custom alternating on/off lengths and dash phase are supported, including
empty and odd-length patterns and zero-length on segments with positive gaps.
Negative lengths and all-zero patterns fail with source diagnostics.

```tex
\begin{tikzpicture}
  \draw[densely dashed] (0,0)--(2,0);
  \draw[dash pattern=on 3pt off 2pt,dash phase=1pt] (0,1)--(2,1);
\end{tikzpicture}
```

## Ordered state

The configured pattern and phase are separate from the last emitted state.
A phase option reapplies the configured pattern. `solid` emits an empty pattern
without erasing the configured phase. Dotted styles resolve the live line-width
register after path options; dashdotted styles capture the width when their dash
command is scheduled. Reapplying the pattern can capture a later width. An
inherited painted pattern is unchanged by a child width option until a dash or
phase option reapplies it.

Curves, compound paths, closed shapes, transforms and clipping have a separate
geometry corpus. Odd-length SVG arrays repeat to form the complete on/off cycle;
phase uses that cycle. General TeX register expansion and arbitrary
dash/path/label/node combinations are outside the declared profile.

## Native evidence and numeric checks

The [forty-line corpus](../tests/Fixtures/Dashes/dashes.tikz) measures style and
option order, widths, phase, physical literals, inline options and scope
restoration. A separate sixteen-paint/three-clip corpus measures native paths,
cubic controls, compound paths, transforms and clipping.

```text
dotnet run --project tools/TikzDashReference -c Release -- check-cached
dotnet run --project tools/TikzDashComparison -c Release
dotnet run --project tools/TikzDashGeometryReference -c Release -- check-cached
dotnet run --project tools/TikzDashComparison -c Release -- geometry
```

These checks need no TeX or browser. Committed native SVG and ordinary PDF
preserve integer path/paint records, original artifacts, producer provenance,
plain/probed invariance and independently registered pages. Current comparisons
also decode serialized dash lengths, phase and dimensions. See the
[line reference](../tools/TikzDashReference/README.md),
[geometry reference](../tools/TikzDashGeometryReference/README.md) and
[comparison guide](../tools/TikzDashComparison/README.md) for controls, live
generation and source-linked numeric reports.

## Image admission

```text
node tools/TikzVisual/compare-dash-lines-conformance.mjs
node tools/TikzVisual/dash-lines-policy-self-test.mjs
node tools/TikzVisual/compare-dash-geometry-conformance.mjs
```

These commands require the pinned development renderer. They compare fresh
public output under fixed native/frame/primary and separate PDF gates, retain
whole/local pairs and source attribution, and need no TeX/PDF executable or
old local experiment folder. The
[line admission](../tools/TikzVisual/DASH-LINES-CONFORMANCE.md) and
[geometry comparison](../tools/TikzDashComparison/README.md) guides describe
required controls and saved evidence.

The corpora have separate calibrated policies and inherit no other corpus's
tolerance. Numeric agreement, repeat rasterization and image sensitivity observe
different boundaries. Thin-content and ink-coverage controls remain necessary
where broad error ceilings alone accept a visible defect.

Finite PDF dimension conversion, shortest decimal operands and rasterizer
handling of thin/subpixel fragments produce measured differences from native
SVG. The [PDF investigation](../tools/TikzVisual/DASH-LINES-PDF.md) and
[independent trials](../tools/TikzVisual/DASH-LINES-TRIAL.md) preserve those
observations. Earlier trials keep pending verdicts; later immutable admissions
supply fixed-family claims. General and hosted conformance remain separate.
See [verification](VERIFICATION.md) for affected and final execution.
