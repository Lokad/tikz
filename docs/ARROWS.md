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

The separate primary experiment fixes short native-point printing and native
picture bounds before applying SVG-only faults. It uses the original intrinsic
natural/expanded routes at both scales and all three backgrounds. Native ink
roots remain diagnostics: shortened ink can escape the picture and the original
SVG viewport can clip it. The policy refuses a changed component count or lost
edge set; it does not enlarge a tolerance to accommodate that clipping mismatch.

```text
node tools/TikzVisual/arrow-primary-self-test.mjs
node tools/TikzVisual/calibrate-arrow-primary.mjs
node tools/TikzVisual/check-arrow-primary.mjs artifacts/arrow-primary-calibration/run-<uuid>/report.json
```

The owned report includes 72 calibration views, 72 ink-root diagnostics, 186
image-only defect views and 48 controlled visibility views. Deliberate faults
cover missing/shifted/reversed tips, shortening, cubic controls/endpoints,
paint, dashes, caps, clips, degenerate directions, picture cropping and deferred
paint order. Controlled faint/subquantum tips probe renderer visibility without
claiming a new native fixture. The saved-image checker rederives limits from
decoded reference/native pixels and verifies local target crops and outcomes.
Visible faults accepted by the limits and faults without a raster change stay
in the report; a completed report grants neither approval nor public admission.

Ordinary-PDF observations register the original driver and both native roots
on unchanged reference pages. They retain relative and absolute viewport
rasterization separately. The existing strict PDF policy is attempted without
relaxing lost-edge failures. A separate prospective SVG ink fingerprint uses
exact integer channel mass and first position moments in fixed page regions;
it tests SVG-only faults and faint content without claiming PDF pixel identity.
Expanded padding controls prove that a root-only change does not move paint on
paper. Both saved measurements and presentation crops have an independent reader.

```text
node tools/TikzVisual/arrow-pdf-self-test.mjs
node tools/TikzVisual/calibrate-arrow-pdf.mjs
node tools/TikzVisual/check-arrow-pdf.mjs artifacts/arrow-pdf-calibration/run-<uuid>/report.json
```

The 296-view experiment retains all strict failures and sensitivity blind spots.
These PDF observations do not approve an arrow image policy or public admission.

A separate prospective PDF rule distinguishes nonzero raw ink below the mask
threshold from an entirely empty native route. It keeps threshold 16 and binds
each eligible region to exact native RGB mass and first x/y moments, along with
native cross-renderer metric limits. Ordinary PDF pixels and moments remain
unchanged. A genuinely missing raw-ink region stays ineligible. Every natural
and expanded 1x/4x view remains required; expanded success does not excuse a
natural picture crop. The earlier strict policy and its failures remain intact.

```text
node tools/TikzVisual/arrow-faint-self-test.mjs
node tools/TikzVisual/calibrate-arrow-faint.mjs <owned-PDF-report> <owned-PDF-check-report>
node tools/TikzVisual/check-arrow-faint.mjs artifacts/arrow-faint-calibration/run-<uuid>/report.json
node tools/TikzVisual/calibrate-arrow-faint.mjs --replay artifacts/arrow-faint-calibration/run-<uuid>/report.json
```

The owned experiment retains all 296 earlier views and tests the prospective
rule against their image-only faults and visibility controls. Focus panels
show exact saved crops of faint regions and actual ink loss, with differences
amplified sixteen times and integer enlargement. Its independent reader
decodes every saved pair, ink moment, fault delta and focus panel. The compact
report links a self-contained manifest, complete policies/outcomes and a local
inspection index. This experiment grants neither policy approval nor public
admission; a common-viewport decision and immutable qualification remain open.

The next native viewport experiment separates source presentation from scene
paint. It retains the original source SVG, source frame and all intrinsic
presentation fingerprints. For the scene comparison, only the outer SVG
viewport is normalized to the fixed physical page; every path, transform,
paint attribute and explicit clip stays intact. Ordinary PDF pixels stay
unchanged. The full page exposes extra geometry outside the native diagram,
where changed pixels must be zero. Root-only faults remain required source
faults, even when scene normalization makes their paint invariant.

```text
node tools/TikzVisual/arrow-viewport-self-test.mjs
node tools/TikzVisual/calibrate-arrow-viewport.mjs <owned-faint-report> <owned-faint-check-report>
node tools/TikzVisual/check-arrow-viewport.mjs artifacts/arrow-viewport-calibration/run-<uuid>/report.json
node tools/TikzVisual/calibrate-arrow-viewport.mjs --replay artifacts/arrow-viewport-calibration/run-<uuid>/report.json
```

All 296 earlier views remain, with 144 added outside-diagram ink controls across
all fixtures, roots, rasters, natural/expanded frames and scales. The local
index links recovered endpoints, faint regions, extra ink, original source
pages and every coupled gate. Source/scene checks are prospective native
evidence. Immutable intrinsic-primary/PDF qualification and public combined
admission remain required.

The compact agent adapter binds five explicit completed reports: primary
observations and their saved-image check, PDF observations and their check, and
public prototype inspection. It copies their artifacts into a self-contained
bundle. The small `report.json` links to a hash-bound manifest, six case reports,
and an offline viewer; no latest pointer or original experiment folder is needed
for replay. It preserves all 746 views, fixed rectangles, native IDs, pending
gates, and actual public source spans. Native controls have no candidate span.

```text
node tools/TikzVisual/arrow-agent-self-test.mjs
node tools/TikzVisual/inspect-arrow-agent.mjs <primary-report> <primary-check-report> <pdf-report> <pdf-check-report> <public-inspection-report>
node tools/TikzVisual/check-arrow-agent.mjs artifacts/arrow-agent-inspection/run-<uuid>/report.json
node tools/TikzVisual/inspect-arrow-agent.mjs --replay artifacts/arrow-agent-inspection/run-<uuid>/report.json
```

Open the bundle's `index.html` to choose a case, family, view and fixed region.
The viewer provides paired saved pixels, raw RGB/alpha difference amplified
16 times, overlay and blink, integer zoom and synchronized scrolling. Links
open the exact measurement, input SVG, images, fixture and public trace. The
checker reconstructs every case and link, independently decodes all 72 public
image pairs and local regions, and exercises viewer pixels for selected 1x/4x
rows across all six cases and three families. Browser qualification serves only
manifest-bound bytes through an intercepted synthetic origin; it starts no
server and blocks other requests. All image policies and public admission remain
pending. Native controls and public prototype images remain distinct evidence.

The stand-alone source-primary experiment prescribes the SVG viewport from
native picture geometry and conservative pen envelopes. The six-decimal header
is computed from native quantities; candidate bounds and pixels supply no
expectations. The original SVG bytes and earlier intrinsic observations remain
available. Its derived reference changes only the outer viewport and preserves
every drawing child, transform, paint attribute and explicit clip.

```text
node tools/TikzVisual/arrow-source-primary-self-test.mjs
node tools/TikzVisual/calibrate-arrow-source-primary.mjs <owned-primary-report> <owned-primary-check-report>
node tools/TikzVisual/check-arrow-source-primary.mjs artifacts/arrow-source-primary-calibration/run-<uuid>/report.json
node tools/TikzVisual/calibrate-arrow-source-primary.mjs --replay artifacts/arrow-source-primary-calibration/run-<uuid>/report.json
```

All 306 new views retain both scales, all three backgrounds and both frames.
Limits are saved before faults. Source framing and pixel checks remain separate;
a cropped root cannot pass through later scene normalization. The owned bundle
copies the 378-view earlier experiment and its checker, preserves raw pixels,
and provides paired focus panels and independent saved-image validation.
Source PDF observations, immutable qualification and public admission remain
required. Production code and package dependencies are unchanged.

The conservative source-PDF experiment compares both the prescribed consumer
viewport and the unchanged drawing exposed on the full physical page. It retains
both original-reference and native reconstruction routes, both raster routes,
all natural/expanded 1x/4x white views, and unchanged ordinary PDF pixels.

```text
node tools/TikzVisual/arrow-source-pdf-self-test.mjs
node tools/TikzVisual/calibrate-arrow-source-pdf.mjs <owned-source-primary-report> <owned-source-primary-check-report>
node tools/TikzVisual/check-arrow-source-pdf.mjs artifacts/arrow-source-pdf-calibration/run-<uuid>/report.json
node tools/TikzVisual/calibrate-arrow-source-pdf.mjs --replay artifacts/arrow-source-pdf-calibration/run-<uuid>/report.json
```

Its 396 views include deliberate native faults, faint/subquantum controls,
outside-diagram paint and expanded padding. Source framing, source PDF pixels
and full-page scene pixels are separate gates. Native-only limits are saved
before faults and indexed in separate files per case, route and raster; earlier
strict topology attempts remain diagnostic evidence.
The owned bundle retains the complete primary experiment and its independent
checker. Saved-image checking reconstructs registration, decodes metrics and
integer ink moments, and validates every paired focus panel. These observations
require independent immutable qualification before public image admission.

The frozen native source cache preserves the complete checked producer bundles
and both independent readers. Its 19,005 indexed files include the outer
manifest; 6,328 distinct byte sequences occupy a 56.5 MB gzip archive. The binary
container has a bounded JSON index and original blobs, with independent SHA-256
bindings for reports, manifests, every blob and both encoded/decoded archives.
It is development reference data and is excluded from the production package.

```text
node tools/TikzVisual/arrow-image-cache-self-test.mjs
node tools/TikzVisual/prepare-arrow-image-cache.mjs --replay
node tools/TikzVisual/materialize-arrow-image-cache.mjs
```

Loading checks all native source guards and rederives the conservative envelopes,
primary policies, source/scene PDF policies, view gates, fault outcomes and
declared visibility limits. It needs no browser, converter or native tool, and
does not read original experiment directories. Materialization recreates complete
producer inputs in fresh ignored folders while preserving original report bytes
and recording their new locations separately. Replay reconstructs the identical
cache under the pinned environment. Corruption controls exercise the actual
codec and loader, including rehashed image/limit replacements, lost raster
coverage, false approval and stale sources. Public image admission remains
pending; cached native observations preserve their original unapproved roles.

Multiple tips per side, bending/flex, reversed/harpoon/open/round variants, custom
arrow declarations and other arrow libraries remain unsupported. Unknown tips,
missing libraries, unsupported options and invalid dimensions produce source
diagnostics. This prototype does not establish full PGF arrow or TeX compatibility.
