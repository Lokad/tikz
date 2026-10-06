# Labeled-border PDF limits and exact native-page guard

This local research stage freezes separate limits for original-driver SVG and
independently reconstructed native SVG against unchanged ordinary TikZ PDF.
It uses the qualified Cairo pages from the [rasterizer investigation](LABELLED-BORDER-PDF-RASTERIZERS.md).
The initial PDF-only sensitivity trial fails on two faint losses at 1x. A
supplementary exact native-page comparison detects both, without changing any
PDF limit. Combined labeled-border conformance remains pending.

## Inputs and commands

These commands consume the explicitly pinned, retained local qualification
bundle and its artifacts under ignored `artifacts/`. They require .NET 10 for
the independent reader, Node and the pinned Chromium distribution. They do not
launch TeX or a PDF executable. A new checkout does not contain these research
bundles; portable cached profile admission and hosted execution remain pending.
No bundle is downloaded, installed or selected implicitly from a new latest
pointer. The qualification identity is declared in
`labelled-border-pdf-calibration-common.mjs`.

```text
node tools/TikzVisual/calibrate-labelled-border-pdf.mjs
node tools/TikzVisual/labelled-border-pdf-calibration-self-test.mjs
node tools/TikzVisual/check-labelled-border-pdf-sensitivity.mjs
```

Wait for each producer to finish before starting a dependent command. The
calibration retains 24 pairs and 1,296 local observations across three cases,
two representations, natural/expanded frames and 1x/4x on white. It independently
checks 908 original-PDF quantities, 264 native outline bounds and twelve root
checks. All measured PNG quantities equal the earlier qualification exactly.
Its 1,392 policy checks include repeats and differences outside the camera.

Every case/view/region retains eight PDF limits: raw and premultiplied changed
pixels, raw and premultiplied maximum channel error, foreground mean channel
error, component-count difference, maximum edge displacement and foreground
pixel-count difference. Each limit is its unchanged independent observation;
only the mean is rounded upward to 1e-9. Original/native limits are separate.
No defect, public scene, production font resource or candidate render supplies
an allowance. Region rectangles and page registration come from native evidence.

The calibration checker independently reconstructs the native SVG, roots,
bounds and PDF quantities, and re-decodes all 1,320 whole/local PNG metrics.
Its 62 controls include altered limits, coverage, engine identities, geometry,
roles and artifact links. Check records contain only the view selector and
metrics; captured source and artifacts accompany every attempt.

## Retained PDF-only failure

The initial sensitivity command bypasses numeric gates and tests 32 defects
in 126 views against the independently frozen PDF limits. Its twelve baseline
views pass. The completed report deliberately has `sensitivityPassed: false`
and exits 1. Four controls have unexpected 1x outcomes:

| Control | Natural and expanded 1x | 4x |
| --- | --- | --- |
| paths: faint glyph-0 loss | 32 native-image pixels change; all PDF limits pass | Local PDF rejection |
| transforms: faint period-11 loss | Three native-image pixels change; all PDF limits pass | Local PDF rejection |
| paths: changed corner join | Native pixels are identical | Local PDF rejection |
| transforms: changed orthogonal join | Native pixels are identical | Local PDF rejection |

Both faint losses reduce opacity to 0.99. Their maximum native-page channel
change is three out of 255. The other 28 controls satisfy their original
expectations. This failed trial remains digest-pinned and is never rewritten
as a passing PDF-only test. Increasing the PDF allowances would further weaken
the detector; no allowance is changed here.

## Supplementary zero-difference gate

The following commands consume the specific completed failed trial declared
in the guard producer and independently checked by the coverage module:

```text
node tools/TikzVisual/check-labelled-border-pdf-page-guard.mjs
node tools/TikzVisual/labelled-border-pdf-page-guard-self-test.mjs
```

The guard compares retained defect PNGs to independently frozen native SVG
page PNGs on the same registered PDF pixel lattice. It requires zero raw RGBA
change on the full page and every fixed whole/local window, in conjunction
with the unchanged PDF verdict. It supplies an additional constraint, rather
than claiming the ordinary PDF and SVG rasterizers have identical pixels.
It invokes no converter, font substitution, fitted alignment or reference
regeneration.

All twelve unmodified baselines pass. Across the 126 defect views, 114 visible
changes fail their targeted image checks and twelve visibility controls remain
pixel-identical. The latter comprise two unpainted-state controls at both
scales and exactly two declared bevel controls at 1x. Both bevel controls must
fail locally at 4x. Other joins receive no visibility exemption. The four
faint 1x views pass PDF-only checks and fail the native-page gate, so both
verdicts remain visible in each report.

The 52-control guard checker independently loops over every RGBA channel of the decoded
full-page PNGs, crops the whole window first and recomputes local metrics in
relative coordinates. It recomputes 138 full pages and 7,392 whole/local metrics
across all twelve baselines and 126 controls, verifies
the externally pinned failed trial/calibration, and re-evaluates PDF limits and
the conjunction. Corruption controls exercise zero limits, coverage, camera
rectangles, summaries, retained PDF blind spots and exact visibility selectors.
One-unit changes to each RGBA channel must reject even when PDF checks pass.

## Agent inspection and remaining admission

Read each stage's hashed `latest.json` and digest-checked `report.json` under
`artifacts/labelled-border-pdf-{calibration,sensitivity,page-guard}/`. Completion
and expected control outcomes differ from conformance approval. Each completed
research report retains `approvedImagePolicy: false`,
`imageConformanceClaim: false` and `overallVerdict: pending`.

Calibration and sensitivity bundles retain the original/native SVGs, unchanged
Cairo pages, full registered SVG pages, whole PDF/SVG/raw/amplified/overlay
PNGs, local measurements and selected source-operation crops. The guard retains
digest-bound copies of its two input reports and four enlarged paired crops for
the faint 1x losses. Its metrics identify the original source bundle's PNGs;
keep that bundle alongside it. The crops show independent native image,
changed image and raw difference amplified 16x. Eightfold nearest-neighbor
enlargement affects presentation only. Original node/glyph/path IDs identify
the operation; the separate public inspector supplies actual source spans.

A fresh public feasibility probe passes 1,624 native numeric checks and exact
native-page pixels in twelve PDF-camera views. This supports the zero-difference
constraint for the three fixtures. It is still separate research evidence.
The [fresh public combined trial](LABELLED-BORDER-COMBINED-TRIAL.md) now requires
numeric, ink/root, primary, original-SVG/PDF, public-SVG/PDF and native-page gates
together. Its saved pixels and source attribution have a separate checker.
The [fresh public image-only PDF/native-page controls](LABELLED-BORDER-PUBLIC-PDF-SENSITIVITY.md)
now pass against the same independent limits and pixel patterns. Portable
caches and immutable combined pins remain required. No existing admitted
profile changes, and no runtime dependency is added.
