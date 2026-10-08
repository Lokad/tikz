# Independent native label glyph export

This development executable links the existing DVI/TFM glyph reader and the
small native-input reader shared with the numeric comparison tool. It has no
production project or package reference. It reads an owned trusted-fixture
report and exports glyph positions plus framework assembly references.

It exists to close the native-only image calibration gap: deriving a reference
must not load or invoke the converter. Use it through
`calibrate-path-label-primary.mjs`, which owns and validates the input/output
bundles with the existing qualification helpers.

From the repository root:

```sh
node tools/TikzVisual/calibrate-path-label-primary.mjs placement
node tools/TikzVisual/calibrate-path-label-primary.mjs interactions
node tools/TikzVisual/check-path-label-primary.mjs <exact-calibration-report>
node tools/TikzVisual/path-label-primary-self-test.mjs <exact-calibration-report>
node tools/TikzVisual/compare-path-label-primary.mjs <exact-calibration-report> <fresh-numeric-iteration-report>
```

Calibration reads frozen native artifacts; it does not rerun TeX. It observes
two fixed native encodings, two capture routes, natural/expanded frames, 1x/4x
density and transparent/white/black backgrounds. Limits come only from those
observations, separately for each whole view and local glyph/path region.

The independent checker decodes the saved PNGs, recomputes limits and verdicts,
reparses DVI/TFM glyph evidence through a fresh BCL-only process, and recaptures
every native encoding and controlled source. Every path label has missing and
quarter-pixel-shift controls on its first glyph. Invisible samples, such as black
text on black or text outside its clip, remain explicit.

Complete-text sensitivity reuses the already checked primary policies:

```sh
node tools/TikzVisual/compare-path-label-text-sensitivity.mjs <exact-calibration-report> <exact-independent-check-report>
node tools/TikzVisual/check-path-label-text-sensitivity.mjs <exact-sensitivity-report>
node tools/TikzVisual/path-label-text-self-test.mjs <exact-sensitivity-report>
```

These controls remove or shift every glyph in each label without changing its
border or other paint. The separate checker decodes whole/local pixels, checks
the frozen policy verdicts and visibility, and recaptures every controlled SVG.
It validates complete glyph and view coverage, including invisible samples.

PDF calibration reuses the same checked native evidence, encodings and image
helpers. Its natural viewport uses native picture bounds rather than the
conservative inspection envelope. Page registration comes from PDF save-position,
picture bounds and measured wrapper glue; no candidate fitting is permitted.
Original-SVG/PDF and native-encoding/PDF policies stay separate. Rasterizer
differences are measured calibrations rather than pixel identity.

```sh
node tools/TikzVisual/calibrate-path-label-pdf.mjs <exact-primary-calibration-report> <exact-independent-primary-check-report>
node tools/TikzVisual/check-path-label-pdf.mjs <exact-PDF-calibration-report>
node tools/TikzVisual/path-label-pdf-self-test.mjs <exact-PDF-calibration-report>
node tools/TikzVisual/compare-path-label-pdf.mjs <exact-PDF-calibration-report> <fresh-numeric-report>
```

The PDF checker independently decodes full-page and local pixels, rederives both
policies and registration, and recaptures every native source. Corruption controls
cover missing/duplicate routes and consistently rehashed pixels and policies.

Current checking joins primary and PDF reports for the same numeric output:

```sh
node tools/TikzVisual/check-path-label-current.mjs <current-primary-report> <independent-primary-check-report> <current-PDF-report> <independent-PDF-check-report>
node tools/TikzVisual/path-label-current-self-test.mjs <current-primary-report> <current-PDF-report>
```

It independently decodes required whole/local PNG metrics and recomputes each
verdict and gate. It checks intrinsic framing against native picture bounds,
validates source captures, performs fresh public conversion and recaptures all
32 primary/PDF views exactly. It rejects omitted views, split numeric provenance,
wrong framing and rehashed false metrics/verdicts. Frozen native calibration is
validated through its qualified receipts and current dependency hashes.

The comparison commands use a fresh numeric receipt and produce paired current
images. These are iteration checks. Portable calibration
and final-tree fresh-export acceptance remain release gates. No command here
declares complete feature or image conformance.
