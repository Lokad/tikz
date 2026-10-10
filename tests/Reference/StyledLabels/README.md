# Styled multiline diagram evidence

These frozen inputs cover only `flowchart-styled-labels.tikz`: six existing EC
faces, explicit and mixed-size multiline rows, three alignment modes, normal
inline math, measured nodes, positioning, five arrows/path labels, sloped
placement and calculated coordinates. The [native observations](../MathLabels/native-layout/flowchart-styled-labels/README.md)
describe the numeric, framing, primary/local and ordinary PDF checks.

`image-profile.json` enrolls eight qualified reports in three archives. The
native group owns the observed drawing and native encodings; primary owns the
native-only image policies and independent checking; PDF owns the measured page,
font/crop/source replay, original/candidate policies and independent checking.
Original math-diagram enrollment remains in its separate profile. All archive
paths, hashes, sizes, report roles, historical native-engine claims and shared
transport sources are checked. Preparation preserves every owned byte and is
deterministic under reversed input order. All three use the existing 48 MB
compressed limit and shared decoded/file/index/count bounds.

Restore the frozen evidence in a clean source checkout without invoking native
tools or the converter:

```sh
node tools/TikzVisual/materialize-path-label-cache.mjs styled-labels-native
node tools/TikzVisual/materialize-path-label-cache.mjs styled-labels-primary
node tools/TikzVisual/materialize-path-label-cache.mjs styled-labels-pdf
```

The existing cache self-test covers generic corruption plus exchanged evidence
phases, erased native-engine history and changed restored owners. The restored
reports retain their historical, unapproved image-policy status. Frozen input
restoration is separate from current conversion and final feature acceptance;
new output must pass the required numeric/image/PDF/source checks before any
current conformance claim.

The existing independent current checker accepts this fixed one-case family or
the original three-case math family. Run it on matching current primary/PDF
reports and their frozen calibrations:

```sh
node tools/TikzVisual/check-math-label-current.mjs <current-primary> <current-PDF> <native-primary-calibration> <native-PDF-calibration>
node tools/TikzVisual/math-label-current-self-test.mjs <current-primary> <current-PDF> <native-primary-calibration> <native-PDF-calibration>
```

It checks nine boxes/27 integer dimensions, 288 integer anchor coordinates,
75 glyphs/two rules, all 24 primary views/2,400 regions and eight PDF views/808
regions. Both routes must own identical public output and the exact frozen
calibrations. PDF checking retains the native-only pixel envelope for the two
thin rules as well as the ordinary regional checks. Shared corruption controls
also reject omitted views, split source, forged summaries, changed decoded pixels
and altered/missing rule envelopes. Final clean-source acceptance and integration
remain separate.
