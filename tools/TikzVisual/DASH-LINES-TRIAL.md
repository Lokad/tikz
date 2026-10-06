# Forty-line primary and PDF trials

These development-only commands extend the independent
[PDF investigation](DASH-LINES-PDF.md). They never refresh a checked-in
baseline or grant immutable image admission. All evidence has a fresh
directory under `artifacts/`, a hashed report and exact tool-source copies.

Run from the repository root, in order:

    node tools/TikzVisual/calibrate-dash-lines-primary.mjs
    node tools/TikzVisual/calibrate-dash-lines-pdf-cairo.mjs
    node tools/TikzVisual/dash-lines-trial-self-test.mjs
    node tools/TikzVisual/trial-dash-lines-conformance.mjs

The primary producer needs the pinned development browser and native cache.
The PDF producer also consumes the explicitly selected local qualification
report and its unchanged Cairo pages. Its path and digest are part of the
source; a new qualification requires an explicit reviewed change. It checks
every qualification artifact and tool hash, native snapshot, camera,
regions and independent representation identities. The 54 exact viewport
controls are reused from this unchanged qualification, with their digest
recorded. It does not rerun TeX or a PDF executable.

Both producers invoke no converter or production resource. The independent
native reconstruction supplies exactly eight variants: native and printed
widths, group and element transforms, and two independently bounded roots.
Each preserves the recorded scaled-point geometry/state. Limits are fixed
before any public candidate is measured.

Primary calibration has 96 observations, 96 exact replays, twelve view
rows and forty fixed local regions. Natural/expanded framing, 1x/4x and
transparent/white/black backgrounds are mandatory. Per-view/per-region
limits are fieldwise maxima of the eight independent representations.
Foreground means are rounded upward to 1e-9; no extra margin is added.

PDF calibration has forty observations and forty exact replays. The original
SVG, eight native variants and literal PDF instructions have separate roles.
Each is rendered on the fixed native page at both resolutions and frames,
then cropped on its integer pixel lattice. Candidate cross-renderer limits
come only from the eight native variants. Original SVG has its own policy;
literal instructions are diagnostic and contribute no candidate allowance.

Both producers reject 21 preselected image-only defects in all required
target views: missing/shifted/thickened/faint content, phase, odd/single/empty
patterns, zero-on and ordinary round caps, width capture/inheritance/scope,
physical literals and root cropping. Root cropping is tested in natural
views; the other twenty defects require both frames. Numeric gates are
bypassed for these trials. Two controls change an unused solid phase and
an unpainted straight-line join; both preserve identical pixels at both
scales and frames. Their semantic differences still need numeric checks.

Two failed experiments are retained with their original source and images.
The initial extra faint mark was outside the natural top viewport and
could not be seen there. Its corrected native coordinates place it inside
both root choices and its fixed path region, in independently verified
empty space below the first line. No limit was changed for this correction.

The original PDF error ceilings also accepted a doubled default thin stroke
at 1x. Its mean error fell from the independent limit of 56.4328 channel
levels to 39.3556: being closer to a different renderer did not prove the
width was correct. This control remains on the default-width line.

The line-specific PDF trial therefore additionally measures actual ink
coverage on the same page/crops. For each RGB channel it sums `255 - sample`
over every white-backed pixel, including faint ink below the edge threshold.
The actual sum must fall within the exact minimum and maximum measured from
the eight independent native SVG variants in that same view/region. There
is no margin, candidate fitting or blank-area averaging. Original-SVG and
literal-instruction policies have their own coverage records. Reference
ink sums must remain identical across all independent observations.

This gate supplements the existing raw/color/foreground/edge/component
checks. It catches the doubled thin stroke at 1x, even when it is closer to
PDF. Every old error-limit row remains exactly unchanged. A separately
added adapter leaves all previously admitted shared raster math and profiles
unchanged. The scope is this black-on-white PDF fixture and pinned browser;
other families do not inherit these ranges.

The research self-test passes 186 recomputation, provenance/coverage,
per-region and ink-channel controls. It checks candidate-free derivation,
missing/duplicate rows, chosen regions/cameras, nonfinite or missing ink,
changed reference signatures, every required region, false admission claims
and the independent geometric containment of the faint mark.

The public command validates both complete independent bundles and
recomputes their policies before invoking `TikzConverter` through the
separate comparison project. Its current prospective trial passes:

| Gate | Required evidence |
| --- | ---: |
| Public native/serialized checks | 927 |
| Root/frame checks | 6 |
| Primary whole/local checks | 492 across twelve views |
| Original-SVG/PDF checks | 176 across four views |
| Candidate-SVG/PDF checks | 176 across four views |

All twelve candidate PNGs equal the preselected independent element-transform
variant. The original SVG still differs by up to three channel levels, so
this is not original-oracle pixel identity. The result remains `trial-pass`
with `overallVerdict: pending`, `approvedImagePolicy: false` and
`imageConformanceClaim: false`.

Open `index.html` in the fresh public bundle or inspect the paired PNGs
directly. All forty path crops exist for every primary/PDF view, with
overlays, raw/amplified differences and a contact sheet. `report.json`
connects each native case/region to its public source span and SVG element;
`candidate-evidence/actual-scene.json` contains the resolved paint/geometry.
The three PDF crop batches must preserve identical measurements and cover
every path exactly once.

Calibration/public commands return zero for their stated unapproved pass,
one for a completed sensitivity/comparison failure, and two for an incomplete
input/tool phase. The self-test returns zero only for complete expected
control outcomes. Failed runs remain retained. These local research commands
consume mutable latest pointers only where explicitly described; normal CI
conformance still needs reviewed, checked-in immutable policies and guards.
Fresh candidate mutations, admission corruption controls, hosted CI and
further dash/path/label/node interactions remain outstanding.
