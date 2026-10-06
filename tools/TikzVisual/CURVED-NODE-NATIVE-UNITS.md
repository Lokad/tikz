# Native-unit curved-node calibration and public trial

The fixed 28-node corpus now has a separate calibration for its declared
native path-unit contract. The earlier CSS policies, failed public trials,
original SVG/PDF references and path-unit experiment remain unchanged.
All reference and rendering tools remain development dependencies.

Run from the repository root:

    node tools/TikzVisual/calibrate-curved-node-native-units.mjs
    node tools/TikzVisual/trial-curved-node-native-units.mjs

The producer consumes the completed independent path-unit experiment by
fixed path and digest. It selects only `pt-short`, the representation that
recovers the original integer scaled-point paths/widths through the
pre-existing short native TeX-point serialization contract. No converter,
candidate scene, candidate image or other representation supplies a limit.
Glyphs retain the independently reconstructed six-decimal CSS matrices;
the semantic root and every native region/camera stay fixed.

Primary limits come from the twelve original-SVG-versus-native observations
in their exact region/frame/scale/background. PDF limits and exact RGB ink
signatures come from the four selected native-page observations. The only
rounding is an upward foreground-mean rounding to 1e-9. There is no added
margin or range across other representations. Original SVG-versus-PDF
policy and all earlier CSS limits remain byte-for-byte unchanged.

The producer performs a fresh framework-only native reconstruction and
requires exact agreement of all 812 serialization checks and the selected
SVG. Twelve primary replays and four native PDF replays reproduce the old
PNG hashes, metrics and ink signatures exactly. Four original-SVG PDF
replays pass the unchanged original policy.

Thirteen image-only defects require rejection in 46 primary and 48 PDF
views with numeric gates bypassed. They cover missing period/font/border,
doubled border, displaced glyph, opacity, quarter-pixel shift, cropping,
ordinary/faint extra ink, one-percent glyph/border loss and ink outside
the whole camera. Natural-only and PDF-only controls retain their declared
visibility scope. Both unpainted-state controls preserve exact PNGs in
eight primary and eight PDF views. All expected outcomes pass.

The period's native sums remain 339 per RGB channel at 1x, against 352 in
the ordinary PDF. Its one-percent opacity loss still reduces the native
sum to 336 and must fail. This independently measured gate retains the
faint-ink sensitivity established before path-unit calibration.

The primary result is a calibrated match to original TikZ. Natural 4x
white-backed rendering has 552 changed pixels, maximum channel difference
50/255 and mean foreground channel error about 0.017443/255. Expanded 4x
has 290 changed pixels, maximum 30/255 and mean about 0.006963/255. The
largest measured threshold-edge distance is one raster pixel, or 0.25 CSS
pixel at 4x; component counts agree. Every local region has its own required
limits and missing-ink controls. Raw/amplified differences remain available.

The public trial validates all independent assets, canonical source hashes
and rederived policies before calling the public converter. It requires:

| Gate | Executed checks |
| --- | ---: |
| Native semantic/layout quantities | 4,461 |
| Ink bounds, picture and SVG root | 406 |
| Twelve primary views, whole picture and all 98 local regions | 1,188 |
| Four original-SVG PDF views | 408 |
| Four candidate-SVG PDF views | 408 |
| Fresh public image-only controls | 15 cases |

The fresh public trial passes every gate. It reruns all thirteen defects
and both exact-visibility controls on the actual emitted SVG, with 46/48
defect views and 8/8 visibility views. The public period loss fails in all
four PDF views. These results require no runtime implementation change.

Its report includes original/candidate PNGs, raw/amplified differences,
overlays, source spans, scene mappings, all control images and a local
gallery. Baseline views save eight region crops with explicit truncation;
all 98 regional measurements remain mandatory. A trusted focused rerun is:

    node tools/TikzVisual/trial-curved-node-native-units.mjs --crop-region glyph-22

Sources use declared canonical UTF-8/LF snapshots, with historical raw
hashes retained. An initial negative-zero replay-check failure remains in
its own bundle; the corrected producer compares the saved JSON form.
This changes no coordinate, SVG or error bound.

These are fixed local research commands. Their completed reports retain
`approvedImagePolicy: false`, `imageConformanceClaim: false` and pending
admission. Immutable profile preparation, independent evidence/candidate
corruption controls, portable cached CI execution, wider shape/label/node
interactions and hosted verification remain required. No other fixture or
library inherits this policy.
