# Independent ordinary PDF observations

```text
node tools/TikzVisual/shape-pdf-self-test.mjs
node tools/TikzVisual/calibrate-shape-pdf.mjs
```

The second command includes the first. It validates the
[cached PDF reference](../TikzShapePdfReference/README.md), then creates a fresh,
independent native SVG/ink/frame reconstruction. No converter assembly, scene,
font resource or candidate image supplies a value or limit.

Each run uses a new GUID directory under artifacts/node-shape-pdf-calibration/.
The latest.json entry links its report and hash and records incomplete runs as
incomplete. Historical runs are retained. Every run copies the exact tool
sources it used, records input/tool/renderer hashes, and verifies the native
reference and output artifacts before completion.

## Fixed page and regions

Native TeX saved positions supply the page origin; it is recomputed from the
integer measurements and checked against the retained PDF record. The original
Poppler page PNGs stay unchanged. SVG drawing instructions map directly onto
that page at 1x/4x, with the natural viewport represented by a separate clip.
The helper keeps source-root attributes and painting order. It checks physical
dimensions and aspect ratio before rendering and rejects executable/external
SVG references.

Both sides are rendered/decoded on the full native page before receiving the
same integer crops. No fractional translation of a PDF bitmap, resizing,
content fitting, or image-based origin search is allowed. A full-page raw check
also detects differences outside the independently fixed whole-picture region.

The whole region comes from the native picture/ink camera. Ninety-eight local
regions use the union of independently evaluated original/native tight stroke
or glyph bounds with three CSS pixels of padding. Required identities and
rectangles are fixed before comparing images. Local regions may overlap and
provide spatial attribution rather than proof of the faulty operation.

The raster observations use the separately tested curved-node metrics:
raw RGBA equality; rounded premultiplied foreground error including every
visible sample; threshold-16 masks; eight-neighbor components; four-neighbor
boundaries; and symmetric Euclidean distances in raster/CSS pixels.
Missing edges retain an explicit state and null distance. All canvases have a
20-million-pixel bound. Whole contact sheets use display resolution; original
4x PNGs and local paired crops remain separately available.

## Executed matrix and controls

Seven independent representations are measured against ordinary PDF:
original driver, driver CSS, native twelve/six decimals, native six-decimal
semantic root, and fixed plus/minus-four-sp sensitivity variants. Natural and
independently expanded framing are reported separately. The full run retains
28 whole-picture and 2,744 local observations, plus 56 exact separately decoded
unchanged PDF/SVG captures. Changing only the native root preserves identical
expanded-page PNGs at both scales.

Fifty-nine controls cover native camera/region validation, malformed coverage,
physical/aspect-ratio errors, external references, changed crops, translation,
and missing faint punctuation/strokes. BP and CSS placement are checked against
manually drawn bitmaps at both scales. Synthetic bitmaps are explicitly
comparator controls and make no ordinary-PDF conformance claim.

The real fixture has 54 additional viewport controls: original driver, native
six decimals and native semantic root; eight-CSS-pixel padding; each boundary
varied independently by plus/minus four sp; and both scales. All full pages and
5,346 required region checks are exact against the unchanged padded SVG page.
Six separate padded-baseline SVG/PDF observations remain recorded. Root-only
changes preserve drawing instructions; neither these controls nor deliberate
sp translations authorize an image tolerance.

## Inspection and limits

The original-driver natural white-paper comparison changes 8,818 pixels at 1x,
with maximum channel error 252/255, mean foreground error 29.362748/255 and
maximum boundary distance 2 CSS pixels. At 4x it changes 46,069 pixels, with
maximum 255/255, mean 25.571167/255 and maximum boundary distance approximately
0.901388 CSS pixel. Mask component counts are 69/67 and 90/91 respectively.
These large raw values remain visible; they are observations rather than limits
or a pixel-identity claim. The complete per-region measurements preserve small
and absent foreground as well as curves and labels.

The bundle has 915 owned artifacts, including 862 PNGs, original/derived SVGs, fixed camera/regions,
viewport controls, native page evidence, exact tool-source copies, hashes,
contact sheets, overlays, raw/amplified differences and integer-enlarged paired
local crops. The report's agent entry point links the highest-error crops,
source fixture, viewer and focused rerun. Paired display-size and changed-font
4x images have been inspected.

Exit zero means complete observations and expected controls. It does not mean
image conformance. Unexpected viewport-control outcomes return one;
dependency/rendering/provenance failures return two. Reports remain pending
with converterInvoked, conformanceClaim and approvedImagePolicy all false.
Only cached references, .NET and the pinned Node/Playwright/Chromium tooling are
needed; no TeX or Poppler process is invoked by these commands.

The separate [prospective PDF trial](PDF-TRIAL.md) now derives scoped policies
from fresh independent observations, replays the measurements before public
conversion and passes both original-SVG/PDF and public-candidate-SVG/PDF gates.
All ten image-only defects are rejected independently of numeric checks at
both tested natural white scales. These prospective policies remain unapproved.
Reviewed immutable primary/PDF admission, focused/interaction corpora and
hosted execution remain pending. Existing admitted profiles are unchanged.
