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

The comparison command uses a fresh numeric receipt and produces paired current
images. These are primary iteration checks. Ordinary-PDF policies,
independent current-output checking, portable calibration
and final-tree fresh-export acceptance remain release gates. No command here
declares complete feature or image conformance.
