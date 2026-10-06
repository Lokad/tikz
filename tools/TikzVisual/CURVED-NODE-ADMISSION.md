# Cached native-unit curved-node conformance

The immutable profile covers the fixed 28 circle/ellipse nodes and 70 glyphs
in `tests/Fixtures/Nodes/shapes.tikz`. It uses the independently selected
short native TeX-point path/width contract and six-decimal glyph matrices.
Other shapes, libraries and label/edge/arrow interactions need separate evidence.
All browser, reference and comparison tools are development dependencies.

From the repository root, with restored .NET projects and the pinned
Node/Playwright/Chromium tools:

    node tools/TikzVisual/compare-curved-node-conformance.mjs
    node tools/TikzVisual/curved-node-admission-self-test.mjs

Cached execution consumes checked-in original SVG, native measurements,
outlined glyph traces and original Splash PDF page PNGs. It does not launch
TeX, dvisvgm, Poppler, or an independent C# reconstruction process.
Only public candidate conversion launches .NET. Ordinary library tests
continue to run without a browser or TeX.

The consumer validates the digest-pinned compressed and decoded calibration,
41 source/reference inputs, 33 calibration source snapshots, eight admission
and numeric tool guards, renderer identity, and explicit UTF-8/LF contracts
before invoking the candidate. Raw SVG/log and binary inputs retain their
original bytes. Host patch release is recorded as provenance; browser,
architecture, OS family, Node, viewport and rendering settings remain pinned.

It reconstructs all native/driver ink extents and fixed regions from original
SVG/PGF/glyph measurements, derives the native PDF camera from integer TeX
page positions, and reproduces all 812 native serialization controls. Limits
are rederived from the selected oracle-only observations, with no candidate
input or margin. Earlier CSS policies and all original reference files stay
unchanged. Replay metrics and shared PNG signatures must agree exactly.
Fifty-four exact viewport controls retain their separately recorded ordinary
PDF comparisons; those comparisons are not exact SVG-versus-PDF claims.

The public combined comparison requires all of these gates:

| Gate | Checks |
| --- | ---: |
| Native layout, paths, anchors and glyph placement | 4,461 |
| Picture, ink and SVG root | 406 |
| Twelve whole-picture/98-region primary views | 1,188 |
| Four original-SVG versus PDF views | 408 |
| Four candidate-SVG versus PDF views | 408 |
| Fresh emitted-SVG sensitivity controls | 15 cases |

Thirteen image-only defects bypass numeric checks and must fail in their
affected regions across 46 primary and 48 PDF views. They include missing
glyphs/borders, shifted geometry, opacity, cropping, extra ink and faint losses.
Two unpainted-state controls preserve the current candidate's exact PNGs in
eight primary and eight PDF views. Region coverage and raw error/ink metrics
are checked again by the combiner; saved evaluation flags cannot grant a pass.
The independently measured 1x period has native ink sums 339 per RGB channel
versus PDF 352. Its one-percent opacity loss yields 336 and must be rejected.

The primary claim is **calibrated primary match**, with a separate
**calibrated PDF cross-check**. Natural 4x white has 552 changed pixels and
maximum channel error 50/255 in the independent observation; expanded 4x
has 290 and 30/255. The maximum threshold-edge displacement is one raster
pixel at 4x, or 0.25 CSS pixel. All local regions have separate required
limits. These are measured differences, not pixel identity or a general
TikZ tolerance. Raw differences remain available even when a gate passes.

Each run writes its own directory under `artifacts/curved-node-conformance/`,
with a digest-linked `latest.json`. `report.json` links original/candidate
images, raw/amplified differences, overlays, source spans, scene mappings,
all control images and `index.html`. Its `agent` entry point includes the
contact sheet, first required failure, failed regions, and rerun/follow-up
commands. An agent can open the PNG paths directly without browsing the gallery.

To inspect one trusted region:

    node tools/TikzVisual/compare-curved-node-conformance.mjs --crop-region glyph-22

This changes presentation crop selection only. All 98 regions, twelve primary
views, both PDF routes and fresh sensitivity controls remain mandatory.
Saved crop counts and truncation are explicit. Source attribution identifies
possible contributing operations where overlapping ink prevents unique blame.

The admission self-test injects missing/changed files, changed or consistently
rehashed evidence, incompatible renderer settings, altered cameras/limits,
incomplete view/region coverage, inconsistent metrics, replay/signature drift
and misleading summaries. Synthetic gate records are labeled as such; they
test the combiner rather than claiming public conversion evidence. Fresh
public SVG defects belong to the combined comparison above.

`prepare-curved-node-admission.mjs` and `promote-curved-nodes.mjs` are explicit
reference workflows for the reviewed local research bundles. Ordinary
comparison cannot generate or rewrite a baseline. Both immutable digests
are pinned in `curved-node-admission-policy.mjs`; changing the producer or
profile needs a separate evidence revision. The source research reports retain
their unapproved status and the earlier failed trials remain inspectable.

CI invokes both cached commands and uploads their inspection artifacts.
Hosted execution and live release verification are separate outstanding gates.
