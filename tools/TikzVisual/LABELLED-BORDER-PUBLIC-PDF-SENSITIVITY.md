# Fresh public labeled-border PDF and native-page sensitivity

This research harness applies the 32 independently specified image-only controls
to fresh public converter output for the three trusted `LabelledBorders` fixtures.
All 126 views satisfy their fixed visibility expectations: 114 visible changes
fail at their target, while twelve declared controls remain pixel-identical.
Numeric gates are bypassed for the mutations, so image checks must detect them.
Conformance admission remains pending.

```text
node tools/TikzVisual/check-labelled-border-public-pdf-sensitivity.mjs
node tools/TikzVisual/labelled-border-public-pdf-self-test.mjs
node tools/TikzVisual/labelled-border-combined-self-test.mjs
```

Finish the producer before starting either checker. It owns a fresh invocation
of the [six-gate combined trial](LABELLED-BORDER-COMBINED-TRIAL.md), consumes that
child's explicit completion record and digest, and copies the exact baseline
report and artifacts. It does not select a baseline from a latest pointer.
The public sensitivity checker records both its input report digest and the
baseline digest; the combined checker must identify that same baseline.

These local commands require .NET 10, Node, the pinned development browser and
the declared ignored qualification bundles. They launch neither TeX nor a PDF
executable. A fresh checkout lacks those research bundles. Portable immutable
profile admission and standalone hosted execution remain future work.

## Independent expectations and retained blind spots

The owned baseline must pass native numeric, ink/root, primary, original-SVG/PDF,
public-SVG/PDF and exact native-page gates for every case. The mutation controls
then use the same fixed native PDF limits and zero-difference native-page gate.
The independent calibration, failed PDF-only sensitivity report and successful
native-page guard are externally digest-pinned. Their artifacts and current tool
sources are verified before running the converter.

Every mutated public full-page PNG has the exact SHA-256 of its independently
constructed control PNG. Ordinary PDF metrics, native-page measurements,
registration, local rectangles and expectations also agree with that independent
evidence. None of the public output or defects supplies a new allowance.

The [original PDF-only failure](LABELLED-BORDER-PDF-CALIBRATION.md) remains visible:
faint glyph loss in `paths` and faint period loss in `transforms` each pass the
ordinary PDF checks at 1x in both frames. The native-page gate rejects all four
views. The report therefore retains `pdfOnlySensitivityPassed: false` alongside
the passing conjunction. Pixel identity refers to the independent native SVG
page; it does not assert identity to ordinary PDF rasterization.

The twelve exact controls comprise unpainted cap/solid-phase changes at both
scales and precisely the two independently demonstrated bevel controls at 1x.
Both bevel controls must fail locally at 4x. There is no general join exemption.

## Verification and agent inspection

The public sensitivity checker independently decodes saved PNGs and recomputes
14,784 whole/local metrics and 138 full-page RGBA comparisons across baseline
and mutations. Its 54 controls cover roles, digests, source attribution,
registration, artifact links, measurements, zero limits, gate summaries,
visibility selectors and preserved PDF blind spots. It also rejects a failed
numeric baseline and an increased independent PDF allowance. JSON omission of
an undefined presentation field is checked as a valid wire representation.

The separate combined checker verifies the baseline's 1,624 numeric and identity
assertions, six gates, source-aware regions and actual SVG operations. It
recomputes 3,960 image metrics and twelve full pages, with 66 integrity controls.
The existing `check-labelled-border-sensitivity.mjs --public` command separately
refreshes the 26 primary image-only controls in 102 views.

Read the hashed `artifacts/labelled-border-public-pdf-sensitivity/latest.json`,
verify completion and the report digest, then inspect `coverage`,
`agent.firstUnexpectedControl`, each view's PDF verdict and `guard.evaluation`.
Open `index.html` and its linked fresh baseline viewer. The bundle contains
ordinary PDF/public whole images, raw differences, amplified differences,
overlays, full registered public pages and a selected target crop per applicable
view. Four paired native-page glyph/period crops show the faint 1x losses with
eightfold nearest-neighbor enlargement and 16x raw-difference amplification.
These presentation operations do not change the measurements.

`targetSource` comes from the actual baseline scene and points to the original
fixture's semantic/SVG operation IDs and source span. It identifies the operation
that was mutated; the mutation is made in SVG rather than reparsed TikZ. Added
ink controls have no invented TikZ source span. All local windows are measured
even when only the target's crop is saved.

Each producer/checker attempt captures tool sources and artifacts in a fresh
GUID bundle. Its latest pointer is incomplete on startup and failure. Failed
attempts are preserved. A completed passing trial still has
`approvedImagePolicy: false`, `imageConformanceClaim: false` and
`overallVerdict: pending`. The next step is to freeze portable evidence and
immutable combined pins with fresh sensitivity and corruption controls.
