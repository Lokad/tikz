# Labeled-border ink, primary trial and sensitivity

These development commands qualify the natural ink root for the three frozen
`LabelledBorders` fixtures and test a prospective primary policy. They do not
admit a combined conformance profile. The production library is unchanged and
still depends only on .NET 10. Cached commands require the pinned browser and
framework-only reference tools, with no live TeX or PDF executable.

Run in order after the documented [visual setup](../../docs/TESTING.md):

```text
node tools/TikzVisual/labelled-border-ink-self-test.mjs
node tools/TikzVisual/calibrate-labelled-border-ink.mjs
node tools/TikzVisual/trial-labelled-border-primary.mjs
node tools/TikzVisual/check-labelled-border-sensitivity.mjs
node tools/TikzVisual/check-labelled-border-sensitivity.mjs --public
node tools/TikzVisual/labelled-border-ink-controls.mjs
```

The independent calibration fixes its representation, cameras, regions and
limits before any public conversion. It invokes only the framework-only
[DVI/TFM reader](../TikzLabelledBorderOracle/README.md), never the converter.
Native integer PGF paths and line widths, DVI glyph positions, original outlines
and original driver paint supply its inputs. It reads no candidate scene,
geometry helper or bundled font resource. The previously studied representation
is explicitly `native-pt-short-glyph-six`: recoverable short native-point paths
with six-place CSS glyph matrices. Other representations cannot set its limits.

## Independent ink contract

`labelled-border-ink.mjs` derives analytic line/cubic geometry, circular-pen
envelopes and miter tips by intersecting offset tangent lines. Moves break joins;
closing segments join the last and first painted edges. Degenerate cubic
tangents use successive control points. Reversals and parallel tangents cannot
introduce infinite miters. Miter-limit rejection is explicit.

Closed four-edge rectangular backgrounds use their polygon pen and miter tips.
Other paths conservatively expand analytic bounds by the circular pen and union
accepted miter tips and retained move locations. Dash gaps may make actual ink
smaller. This is an envelope contract, not a claim of tight dashed ink bounds.
Glyphs use analytic bounds of the original outline under the full native frame.

The root unions the native PGF picture box with all 26 path and 40 glyph
envelopes. It is independently qualified to contain all 66 records. Browser
`getBBox` checks geometry, excluding unpainted move locations and empty closing
segments, against the independent analytic bounds in 264 scalar checks. Its
fixed limit is 0.00004 CSS px. Nineteen separate analytic/negative/browser controls
exercise acute and closing joins, rotated rectangles, cubic extrema, subpath
breaks, trailing moves and nonfinite/unsupported cases.

SVG roots serialize at six decimal places with twelve explicit rounding checks.
Changing the root must preserve every drawing instruction. This root can extend
beyond the PGF picture or original driver crop: miter ink requires space. Original
natural-root comparisons remain in the report, alongside expanded-camera views.
No alignment, cropping fit or per-image translation is permitted.

## Prospective primary limits

Calibration saves 36 whole-picture pairs and 1,944 local observations: natural
and expanded views at 1x/4x over transparent, white and black backgrounds. The
162 fixed regions come from original paths, endpoint locations and glyph outlines.
Reference repeats must be pixel-identical.

Each case has a separate unapproved policy derived from its independent native
reconstruction versus the unchanged original SVG. All raw/premultiplied pixel
counts, channel maxima, topology and edge limits equal that specific observation.
Only the foreground mean rounds upward to 1e-9 channel units. No additional
margin comes from a candidate, defect trial or another fixture/profile.

The fresh public trial requires 1,624 native numeric checks, 264 independent
path/glyph bound checks and twelve natural-root checks before its image result
can pass. Ideal bounds have a separately fixed 1e-8 CSS px arithmetic limit;
serialized roots have a 1e-6 CSS px limit. All 36 views and 1,944 local observations
must pass their own limits. The trial retains raw original-driver differences
and reports `overallVerdict: pending`, `approvedImagePolicy: false`,
`imageConformanceClaim: false`, and PDF state `pending`.

The current public drawing produces exactly the independent reconstruction's
36 actual PNGs and 1,944 local measurements. Equality to this independently
derived representation does not mean pixel identity with the original driver.

## Image-only sensitivity

The independent and fresh-public commands each mutate SVG images while bypassing
numeric gates. They retain twelve unchanged white baselines and 102 required
control views. Target regions still come from original evidence.

Twenty-four defects cover missing and 1% opacity-loss glyphs (including periods),
shifted glyphs, missing/double-width backgrounds, missing/faint connections,
half-CSS-pixel endpoint and cubic-control changes, bevel joins, a four-CSS-pixel
natural-root crop, and opaque/1%-opacity extra ink. Every visible view must fail
both the image policy and its intended local gate; extra ink uses the global gate.
Root cropping is tested only in natural views because expanded views replace the
root by construction. Two additional controls require exact PNG identity after
changing an unpainted closed-path cap or an inactive solid-path dash phase.

The bevel change at `paths:path-4.endpoint-1` is independently pixel-identical at
1x, so those two views require exact baseline PNG identity and a passing policy.
Both 4x views must reject the visible corner change locally. A 1x passing policy
alone is insufficient. The initial all-scales-rejection failure remains retained:

`artifacts/labelled-border-oracle-sensitivity/run-fdac7579-7357-4c8d-9752-b5ae50558899/report.json`

SHA-256: `dbaac9f23369055e323ed71320c715ef93e4cd563cdc4f31a2c1e54886b26c5c`.
Its defect pixels equal the baseline at 1x; this changed the sensitivity
expectation, with no change to any image limit or native geometry.

## Agent inspection and integrity

Read the hashed `latest.json` pointer under each command's artifact folder, then
its fresh `report.json` and `index.html`. Calibration uses
`artifacts/labelled-border-ink-calibration/`; public trials use
`artifacts/labelled-border-primary-trial/`. Sensitivity uses
`artifacts/labelled-border-oracle-sensitivity/` and
`artifacts/labelled-border-public-sensitivity/`.

Every measured view saves reference/actual/difference/alpha-difference/overlay
PNGs and amplified differences. Selected regions save paired enlarged crops with
the exact raster rectangle and integer enlargement. Focused crops are
presentation only; complete regional measurements remain available. Public
`candidate/<case>/actual-scene.json` connects region indices to source spans,
semantic IDs and `candidate-pN`/`candidate-gN` SVG operations. Original numeric
records, derived instruction/ink/policy JSON, tool sources and their hashes are
retained. The [general inspector](../TikzLabelledBorderComparison/README.md)
provides ranked source-linked regions and explicit crop requests.

Coverage validation requires complete case/view/region matrices, repeated
references, exact crop lattices, framework-only oracle references, native-root
math, declared numeric limits and independently recomputed policies. It
recomputes every public/image-only verdict and verifies visibility controls
against stored baseline PNG hashes. The separate controls command verifies all
artifact/tool hashes, independently reconstructs frames, all 66 ink records,
578 serialized drawing quantities and twelve root checks, and compares the
36 public/native images and their 1,944 local observations. It also rejects
mutated roles, evidence, coverage, camera, root/bound limits, metrics, policies,
gate summaries and sensitivity expectations.

All output directories are fresh GUID bundles; failed experiments stay in place.
Prepared CI commands upload them. Hosted execution remains unverified. Independent
PDF qualification, both SVG-versus-PDF routes and immutable combined admission
are still required before a labeled-border conformance claim.
