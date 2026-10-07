# Arrow prototype

The public converter supports one arrow tip at each end of a stroked path:
legacy `To`, the `arrows.meta` replacement for `To`, `Stealth`, and `Latex`.
The production assembly still depends only on .NET 10.

```tex
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}
  \draw[-{Stealth[length=8pt,width=6pt,inset=2pt]}] (0,0)--(2,0);
  \draw[{Latex}-{Stealth},shorten >=2pt,shorten <=1pt] (0,1)--(2,1);
\end{tikzpicture}
```

`->`, `<-`, `<->`, `>=Latex`, `arrows=...`, and grouped start/end
specifications are accepted. `length` and `width` take positive physical
dimensions; `Stealth` also accepts a nonnegative `inset` smaller than its length.
Explicit shortening accepts positive and negative physical dimensions. Loading
`arrows.meta` through the source or `TikzOptions.Libraries` changes the default
`To` tip from the legacy open curve to Computer Modern Rightarrow. The same
library enables the named modern tips. Library definitions remain local to one
conversion.

Tip dimensions are physical: scaling a path changes its endpoints and tangent,
while the tip dimensions and shaft pen width retain their physical sizes.
Defaults and tip pen clamping use the final effective shaft width, including
deferred edge paint resolution. Tips reset the dash array and phase, inherit
stroke color as their fill color, and retain applicable opacity and clips.
Legacy and modern `To` use rounded caps/joins; `Stealth` and `Latex` use their
finite filled outlines and miter joins.

Node borders and connection curves resolve before arrow lowering. End shortening
precedes start shortening. The current implementation reproduces native quick
curve shortening: it moves the endpoint along its endpoint tangent and leaves
the control points in place. Degenerate controls fall back to the next available
point. Zero directions use PGF's upward normalization. Negative and excessive
shortening preserve native behavior. Both tips belong to the final subpath of
a compound path; a closed subpath suppresses normal tips and shortening.

Lowering emits an ordinary shaft path followed by start/end painted tip paths.
The graphics scene retains each tip's local geometry, finite canvas matrix,
tip/back/line/visual ends, configured/final dimensions and picture hull, with
source spans. The SVG writer uses those paths and transforms. It emits no SVG
markers. Generated geometry and arithmetic share conversion limits and
cancellation.

The six frozen, independently authored fixtures contain 118 physical paints and
59 placements. The public scene and independently decoded returned SVG pass
12,062 numeric checks for paths, finite template dimensions, shortening,
matrices, paint, clips, order and picture bounds. Ordinary and traced conversions
agree on SVG bytes, bounds, diagnostics and statistics. The XML reader recovers
integer scaled points from emitted decimal operands; it also checks root-size
consistency. Raw serialization and rendered-image fidelity remain separate.

```text
dotnet run --project tools/TikzArrowComparison -c Release
node tools/TikzVisual/inspect-arrow-public.mjs
dotnet test Lokad.TikZ.slnx
```

The numeric command consumes the unchanged native snapshot and validates every
native artifact and producer source hash. It captures current converter/tool
sources, assembly identity, public SVGs, source-aware scenes and checks in a
fresh ignored directory. It invokes no native reference engine or browser.
Its return codes are zero for numeric agreement, one for candidate mismatch,
and two for incomplete or invalid evidence.

The inspection command owns a fresh numeric run and produces 72 primary views:
natural/expanded frames at 1x/4x over transparent, white and black backgrounds.
Its 118 paired tip crops use rectangles derived from native paths, placement
matrices and effective pens. PNGs, raw/amplified differences, overlays, source
attribution, JSON reports and a local gallery remain available without a hosted
service. Both reference and candidate captures must repeat exactly. Existing
inspection helpers are reused without changing their qualified policies.

The native-only grounding harness reconstructs the frozen paints without invoking
the converter. It distinguishes original picture bounds from shortened-path ink,
checks finite tip hull arithmetic, and derives fixed cameras and 741 regions for
paints, placements, endpoints, curve samples and clips. Browser-free controls
include independently calculated line/cubic bounds, pen caps, empty geometry,
finite hull products and over-shortening. Native tip matrices remain continuous
for rendering; the picture hull uses finite scaled-point arithmetic.

```text
node tools/TikzVisual/arrow-native-self-test.mjs
node tools/TikzVisual/inspect-arrow-native.mjs
node tools/TikzVisual/check-arrow-native.mjs artifacts/arrow-native-inspection/run-<uuid>/report.json
```

Inspection compares four declared coordinate representations (short/twelve-digit
TeX points and six/twelve-digit CSS pixels), picture/ink roots, intrinsic/expanded
frames, 1x/4x scales and three backgrounds: 576 primary views. Another 120 views
compare the original driver and all four reconstructions with the unchanged
ordinary PDF pages. Every tip has paired 1x/4x inspection crops. The separate
checker reconstructs frame/serialization bindings, checks source and artifact
coverage, and re-decodes saved images to verify whole/local measurements and
presentation pixels. Source captures, retained failures, reports and the local
gallery stay under ignored `artifacts/`.

These are prototype numeric results and native-only image observations.
Independent primary/PDF calibration, image-only defect sensitivity, an owned
combined public checker, labeled-node interactions and hosted qualification
remain required. No older fixture family's image allowance applies to arrows.

Native precision research separates three printing factors: path/clip coordinates,
pen/dash dimensions and placement translations. An eight-way matrix and isolated
diagonal-pen probes compare short and twelve-digit decimals without invoking the
converter. The original intrinsic-image captures remain available alongside an
explicit viewport route using the same registered camera and declared root clips.
Subpixel and cropped-root controls check both routes. Rounded intrinsic image
dimensions do not establish bitmap upsampling; both routes resolve a quarter-CSS-
pixel square at 4x in the pinned renderer.

```text
node tools/TikzVisual/arrow-precision-self-test.mjs
node tools/TikzVisual/inspect-arrow-precision.mjs
node tools/TikzVisual/check-arrow-precision.mjs artifacts/arrow-precision-inspection/run-<uuid>/report.json
```

The report keeps a small entry point and links separately hashed whole/local
measurement files, SVG inputs and paired PNGs. The checker reconstructs the
experiment inputs and re-decodes every saved measurement and presentation panel.
These experiments explain representation sensitivity; they set no image limits
and grant no public conformance claim.

Multiple tips per side, bending/flex, reversed/harpoon/open/round variants, custom
arrow declarations and other arrow libraries remain unsupported. Unknown tips,
missing libraries, unsupported options and invalid dimensions produce source
diagnostics. This prototype does not establish full PGF arrow or TeX compatibility.
