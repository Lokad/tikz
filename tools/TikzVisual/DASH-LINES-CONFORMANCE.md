# Forty-line combined conformance

The `chromium-153-cairo-24.04-dash-lines-v1` development profile applies only
to the forty horizontal dash cases in `tests/Fixtures/Dashes/dashes.tikz`.
Its independent evidence is separate from the sixteen-path geometry family
and from all node, label and library profiles. The production package gains
no dependency from this tooling.

Run the cached comparison and its controls from the repository root:

    node tools/TikzVisual/compare-dash-lines-conformance.mjs
    node tools/TikzVisual/dash-lines-policy-self-test.mjs

These commands require .NET and the pinned development browser. They consume
checked-in native measurements, outlined SVG/PDF references, compressed
independent calibration and two unchanged Cairo page rasters. They invoke
neither TeX nor a PDF executable and need no ignored upstream checkout or
local calibration run. The comparison has no baseline-writing mode.

All five gates are required:

| Gate | Checks |
| --- | ---: |
| Native/public geometry and serialized state | 927 |
| Root/frame quantities | 6 |
| Primary whole picture and forty regions, twelve views | 492 |
| Original SVG against ordinary PDF, four views | 176 |
| Candidate SVG against ordinary PDF, four views | 176 |

Primary views cover natural/expanded frames, 1x/4x, and transparent/white/black
backgrounds. PDF views cover both frames and resolutions on white. Native
page registration and region coordinates are fixed by independent measures;
there is no image fitting. The cached reader also verifies 444 original PDF
instruction quantities and the independent rasterizer qualification.

The loader pins both compressed and decoded calibration digests, validates
35 calibration source hashes and four admission tool hashes, reconstructs
all eight native representations, and rederives every limit. It verifies
96 primary and forty PDF observations and their exact replays, 54 viewport
controls, 24 repeated page renders, twenty equivalent-encoding controls,
the unchanged-instruction wrapper, and targeted sensitivity/visibility
evidence. Missing or changed data, tools, pages, cameras, regions, views,
limits or renderer contracts fail. A consistently rehashed replacement
calibration cannot bypass the reviewed digest.

Primary and PDF error ceilings use only independent observations, with
foreground means rounded upward to 1e-9 and no extra margin. PDF ink ranges
use exact integer RGB sums over the white-backed native page crops, including
faint samples. This additional gate rejects a doubled thin stroke at 1x
whose error against the other renderer decreased. Original SVG and literal
PDF instructions retain separate policies; literal instructions provide
no candidate allowance. The old error ceilings and all original references
remain unchanged. See the retained [trial evidence](DASH-LINES-TRIAL.md)
and [rasterizer investigation](DASH-LINES-PDF.md).

The public candidate matches the preselected independent element-transform
representation in all twelve primary PNGs. Its original-SVG comparison has
nonzero raw differences, so the reported labels are
`calibrated-primary-match` and `calibrated-PDF-cross-check`. A combined pass
is a scoped measured result, not a claim of pixel identity with all TikZ.

The control command checks missing/changed evidence, renderer/profile and
intrinsic calibration mutations, incomplete gate coverage, and the inability
of matching images to override numeric or frame failures. It then runs the
public converter afresh and independently tests all 21 image-only defects
against both primary and PDF gates. Each target must reject at both scales
and frames; root cropping requires natural views. Two unused-state controls
preserve exact pixels and still require semantic numeric checks.

Each fresh comparison owns a hashed `report.json`, `index.html`, source,
resolved scene, exact tool sources, whole images and forty paired crops in
every primary/PDF view. Reports link native case IDs to source spans and SVG
element IDs. Every crop batch must preserve identical measurements; all
linked assets have checked hashes. Open the paired PNGs or the local viewer
to inspect the original, actual and raw/amplified differences. Control runs
also retain each mutated SVG and the targeted paired crops.

Explicit reference preparation and promotion remain separate:

    node tools/TikzVisual/prepare-dash-lines-admission.mjs
    node tools/TikzVisual/promote-dash-lines.mjs

Preparation consumes the fixed paths and hashes of the reviewed research
reports and writes only ignored artifacts. Promotion verifies the guard's
reviewed digest and independent invariants before writing reference files.
A new calibration requires an explicit source/digest review. Gzip keeps the
full raw observations, replays, metrics and sensitivity evidence together;
the readable profile retains cameras, regions, limits and contracts. Decoding
is bounded to 64 MB. Absolute executable paths are stripped from public data.

Cached visual CI requires comparison and controls and uploads both bundles.
Hosted execution remains unverified. Label/node interactions, other paths,
future libraries and broader compatibility/release qualification remain separate work.
