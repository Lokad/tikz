# Styled multiline flowchart: numeric grounding

The repository-authored `flowchart-styled-labels.tikz` combines four measured
nodes, five path labels, five Stealth arrows, positioning and a calculated
return coordinate. It uses all six existing EC prose faces (regular, bold and
italic at 10/12pt), normal inline math, left/center/right alignment, mixed-size
two/three-row labels, grouped font changes and a sloped two-row path label.

The frozen observation has nine boxes, 144 anchors, 75 glyphs and two rules.
Ordinary tests check every box, anchor, font/slot/position, rule and paint order
using independent native TFM widths and DVI movements. The original outlined
SVG is bound to 176 origin/glyph/rule quantities. Plain/probed SVG bytes agree.
The selected EC TFM bytes use the existing text profile; no new production
font resources or runtime dependencies are introduced.

PGF's rectangle `mid` anchor uses the querying font's `.5ex`. These probes
query after the picture in the surrounding default font, including the node
constructed with `node font={\large\bfseries}`. The trace exporter uses that
same querying context. Node-font metrics still determine construction geometry.

```sh
dotnet test Lokad.TikZ.slnx
dotnet run --project tools/TikzReference -c Release -- export-math-labels --case flowchart-styled-labels --out artifacts/styled-labels-public
```

Trusted live regeneration, separate from ordinary tests:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs flowchart-styled-labels
```

The selector checks the fixed source digest before launching MiKTeX. Frozen
references are retained separately and are not overwritten by this command.
The original three math fixtures remain the default export/reference corpus.

Paired image inspection at 1x/4x on transparent/white/black backgrounds shows
zero measured edge displacement and equal component counts. Strict zero-error
comparison fails: the largest sample error is 6/255, with 150 changed pixels
in the 4x white view. The natural size difference is below 0.000005 CSS pixels.
These are iteration observations. Native-only calibration, source-attributed
local checks, original/candidate PDF checks and final current-source image
qualification remain required before admitting this additional diagram.

The existing native-only encoding experiment explains the observed sample
difference: using independently measured integer glyph placements reproduces
the converter's PNG bytes exactly at both 1x and 4x in four encodings (DVI
outlines or selected-size atlases, with 6/12-digit matrices). Fractional driver
advances and transform flattening produce different sample patterns. The
experiment checks eight encodings in 48 views, including 16 transparent pairs
decoded independently. It runs neither TeX nor the converter:

```sh
node tools/TikzVisual/math-label-native-images.mjs --case flowchart-styled-labels --out artifacts/styled-label-native-images
node tools/TikzVisual/check-math-label-native-images.mjs artifacts/styled-label-native-images/report.json
```

This explains the iteration discrepancy for the observed views. It does not
replace local/phase sensitivity, native path/framing or PDF qualification.

The additive `framing.json` and `paths.json` bind the original drawing to five
arrow placements, ten unique PGF paths and fourteen painted paths (four node
outlines, five connections and five uses of the shared Stealth template).
Supplemental probes preserve the original drawing, text boxes, anchors and
font/glyph/rule observations. The existing frame builder derives picture,
painted ink and natural root bounds plus 100 label/glyph/rule/path regions.

Iteration checks cover four serialized root dimensions, 275 independent path,
transform, pen and conservative metadata quantities, and eight natural/expanded
image pairs with 800 independently recomputed region checks. Glyph/rule bound
residuals are below 0.0000000000001 CSS pixels; raw path-ink diagnostics retain
the public conservative padding separately from exact painted ink. Fourteen
existing path/bounds corruption controls pass for the additive diagram. These
checks retain the original three-case default. Both PDF routes and final
fresh-source feature acceptance remain open.

Trusted supplemental observation:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs --paths flowchart-styled-labels
```

Native primary/local calibration now covers two integer encodings in 48 views
across intrinsic-image/explicit-viewport capture, natural/expanded framing,
1x/4x scale and transparent/white/black backgrounds. All limits come from the
native-only observations. Twenty missing/quarter-pixel-displacement controls
exercise the six EC faces (including the small period), normal math under bold
prose, both rules and the complete sloped multiline label. All 80 fault views
are visible and rejected with numeric checks bypassed.

Independent checking decodes 128 whole pairs and 12,800 region observations,
rederives policies and recaptures every native/control source. Ten generic and
math ownership corruptions are rejected. Current converter output passes all
24 required primary/local views, 2,400 region checks and 24 source recaptures;
the corresponding native integer PNGs are byte-identical. The original three
cases still pass their 72 views and original frozen policies. These scoped
primary results do not close PDF, portability or final-source acceptance.

The ordinary PDF reference also binds the selected TFM/Type 1 inputs, all nine
boxes and 144 anchors, picture bounds and measured page origin. Plain/probed
PDFs and their 1x/4x rasters are byte-identical. The shared PDF camera derives
101 picture/label/glyph/rule/path regions without fitting or resampling.

PDF calibration compares the original driver SVG and two native integer SVG
encodings in four views each. The same twenty local faults exercise eighty
PDF views with numeric checks bypassed. A quarter-pixel fraction-bar shift
demonstrated that endpoint errors can cancel in aggregate regional metrics.
For this case's two rule crops, each policy also bounds every pixel/channel
error against the PDF by the maximum observed in its native encodings. The
new limits use no converter or fault observations; existing cameras, PNG
decoding, aggregate checks and report controls are reused. All eighty visible
fault views are rejected in their owned regions. Twenty-two image corruption
controls and ten native ownership/replay controls pass. The original three
cases preserve their frozen limits and pass all twenty-four current PDF views.
Independent checking decodes all 92 comparisons and 9,292 regions and recaptures
every native/control SVG source. Current styled output passes all eight
original/candidate PDF views, 808 region checks and eight source recaptures.
These iteration results leave portable evidence and final source acceptance
open.
