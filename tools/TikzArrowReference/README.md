# Native arrow references

The complete diagram workflow reuses these probes and readers through
`tools/TikzVisual/diagram-arrow-reference.mjs`; see the
[comparison workflow](../TikzPathLabelComparison/README.md). Text is admitted
only in that bounded geometry mode and remains grounded by the separate DVI/TFM
reader. The glyph-free workflow below preserves its original restrictions.

Frozen snapshots retain generator/reader hashes as provenance. Current checks
verify the fixture/manifest/TeX inputs, reparse raw observations and require the
same semantic records and native check coverage. Historical checker arithmetic
stays in the snapshot; current PDF rectangle checks convert each `re` operand
separately, as the PGF PDF driver does. Unchanged native images are preserved.

This development harness supplies native geometry for the
[public arrow subset](../../docs/ARROWS.md). It uses six authored, glyph-free TikZ fixtures with legacy
`>` defaults, `arrows.meta` defaults, Stealth and Latex dimensions, explicit
shortening, transforms, curves, empty nodes, deferred edges, paint, clipping and
degenerate paths. It establishes native evidence; it admits no candidate image
policy. Public syntax and current candidate qualification are documented separately.

Run from the repository root:

```text
node tools/TikzVisual/arrow-reference.mjs check-cached
node tools/TikzVisual/arrow-reference-self-test.mjs
```

Cached validation and all 31 observer/reader controls need Node only. They launch
no TeX, browser, PDF tool or converter. The independent SHA-256 pin binds the
snapshot, 90 native artifacts and 17 canonical source inputs. Validation
reconstructs native measurements and checks both original driver instruction
streams. Changed or rehashed replacement evidence cannot authorize a new oracle.

For explicit live reference work with the pinned MiKTeX/PGF, dvisvgm and Poppler:

```text
node tools/TikzVisual/arrow-reference.mjs probe
node tools/TikzVisual/arrow-reference.mjs verify-live
```

`probe` writes a fresh ignored research bundle. `verify-live` independently
reproduces the frozen corpus without replacing it. `generate` creates an initial
snapshot and its pin only when no snapshot exists; ordinary validation cannot
write baselines. The final stdout record gives the exact completed report and
its SHA-256. Interrupted or failed runs retain an incomplete report and logs.

Each live run compiles plain and instrumented SVG/DVI and ordinary PDF routes.
The probes read original and shortened soft paths, tip template geometry,
configured/saved dimensions, end distances, hulls, explicit shortening registers
and cached tip placements. They inject no drawing or driver markup. SVG and PDF
bytes, PDF page samples, native layout and timestamp-normalized DVI instructions
must agree between plain and probed runs. Only the DVI preamble comment is
normalized; instruction bytes and offsets remain unchanged.

Callback order is retained separately from physical paint order. PGF can buffer
an edge before painting the main path. The reader uniquely matches native path
geometry and tip placement to the original SVG's paint sequence, then verifies
that same sequence in the ordinary PDF. Ambiguous identities fail validation.
Effective widths, caps, joins, colors, opacity, dashes and clips come from both
driver outputs. Every tip must reset the shaft's dash pattern. The six fixtures
provide 28 cached templates, 59 tip placements, 118 painted paths and one clip,
with 5,320 independent geometry/state/registration checks.

Driver serialization has explicit quantity-specific limits: native SVG lengths
within one sp, six-decimal matrix coefficients within their printed grid, PGF's
finite bp conversion for PDF operands, and half the printed 0.001 bp cell for
page dimensions and picture origin. These limits validate the native observers;
they are not raster tolerances for a converter. Smooth SVG cubic shorthand and
consecutive moves have declared semantic normalization, with raw native records
preserved. Numeric shortening relations remain exact in sp.

Library declarations end with `%` to suppress outer TeX glue. The picture box
must equal its native bounds span, and the PDF's actual transform must agree
with the independently saved page position. Original SVGs, PDFs, 96/384 dpi PDF
PNGs, logs, metrics and provenance remain inspectable under
`tests/Reference/Arrows/` and in a live bundle's `native/` directory. A coding
agent can open the saved PDF PNGs directly and follow the integer measurements.

The controls reject altered geometry, shortening, cache reuse, tip pen width,
clipping, paint state/order, page position, incomplete records and false evidence
bindings. They also preserve the intentional deferred paint order. Broader
arrow/label interactions, public converter behavior, independent primary/PDF
calibration, image-only defects and combined image admission remain required.
All harness dependencies are development-only; the production package depends
only on .NET 10.

## Archive maintenance and historical replay

The retained image archives also preserve earlier qualification stages. These
standalone entrypoints own their preparation, integrity controls and independent
replay; they are separate from current candidate admission in [ARROWS](../../docs/ARROWS.md).

| Retained stage | Maintenance and replay tools |
| --- | --- |
| Native-source image evidence | [Prepare](../TikzVisual/prepare-arrow-image-cache.mjs), [materialize](../TikzVisual/materialize-arrow-image-cache.mjs), [check source baselines](../TikzVisual/check-arrow-source-baselines.mjs), [aspect-ratio investigation](../TikzVisual/probe-arrow-aspect-ratio.mjs) |
| Native-meet evidence | [Prepare](../TikzVisual/prepare-arrow-meet-image-cache.mjs), [codec/integrity controls](../TikzVisual/arrow-meet-image-cache-self-test.mjs), [independent baseline checking](../TikzVisual/check-arrow-meet-baselines.mjs) |
| Public-control evidence | [Archive integrity controls](../TikzVisual/arrow-public-image-cache-self-test.mjs), [independent primary controls](../TikzVisual/check-arrow-primary-controls.mjs), [independent PDF controls](../TikzVisual/check-arrow-pdf-controls.mjs) |

Preparation writes ignored output and never silently updates tracked pins.
Saved-report checkers require the exact report path; run the entrypoint with its
documented arguments and retain the printed digest. Frozen archives and their
original pending verdicts remain unchanged when current sources are repaired.
