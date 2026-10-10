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

The owned public source baseline trial consumes this frozen cache before it
invokes the public converter. It saves numeric/trace parity, intrinsic source
frames, 144 primary pairs and 192 source/scene PDF comparisons. Native policy
bindings are recorded before conversion; public errors supply no image limits.
Both original PGF and reconstructed-native routes remain visible, and exact
qualified SVG-page agreement is distinct from separately calibrated PDF agreement.

```text
node tools/TikzVisual/trial-arrow-source-baselines.mjs
node tools/TikzVisual/check-arrow-source-baselines.mjs artifacts/arrow-public-source-baselines/run-<uuid>/report.json
node tools/TikzVisual/probe-arrow-aspect-ratio.mjs artifacts/arrow-public-source-baselines/run-<uuid>/report.json
```

Open the trial's `index.html` for paired primary images and fixed-region crops;
the compact entry links complete measurements, numeric output and PDF records.
The independent reader checks the report/manifest and complete coverage, reruns
the public numeric comparison, reconstructs source frames, decodes every saved
pair, recomputes local metrics and integer ink moments, and checks presentation
panels. Successful evidence checking preserves a failed baseline's verdict.
Its corruption controls invoke the actual bundle validator.

The first baseline remains failed: all 12,062 numeric checks and every PDF route
pass, but 28 natural views per primary route fail. A native encoding probe
changes only `preserveAspectRatio="none"` to the SVG default, preserving drawing
children and every other root attribute. This reproduces all measured public
errors, with exact public diagnostic pixels in all 72 views. The probe derives
no policy and invokes no production converter. An explicit production root
contract, a repaired fresh baseline, public image-only defects and visibility
controls, independent checking and fresh exported-tree proof remain required
before fixed-family public image admission.

The production SVG root now declares `preserveAspectRatio="xMidYMid meet"`.
This makes the aspect-preserving SVG default explicit when a consumer changes
the containing viewport. A global `none` experiment improves the six arrow
baselines under the earlier source encoding but fails prior geometry, node,
border and edge profiles. Those failures remain evidence; the old cache and
its limits are unchanged. The root behavior must be checked across supported
families, including intrinsic, wide, tall and proportionally scaled viewports.
[SVG 2 viewport rules](https://www.w3.org/TR/SVG2/coords.html#PreserveAspectRatioAttribute)
define the uniform scale and alignment.

A separate native-only experiment qualifies the aspect-preserving source
representation without invoking the converter or native TeX/PDF executables:

```text
node tools/TikzVisual/calibrate-arrow-meet-source.mjs
node tools/TikzVisual/check-arrow-meet-source.mjs artifacts/arrow-meet-source-calibration/run-<uuid>/report.json
```

The producer consumes the pinned original cache and changes only the outer
aspect-ratio declaration in each original/reconstructed SVG. It records hashes
of the drawing children and other root attributes, retains unchanged native
envelopes/cameras/regions, and captures all 306 views: 72 baselines, 186 defect
views across sixteen families, and 48 faint/subquantum controls. Limits derive
only from the new native baseline pairs and have a distinct scope. Unchanged
rasters and visibility blind spots stay explicit. The experiment does not reuse
the old `none` limits to approve the new presentation.

The independent reader reconstructs every linked SVG from the pinned cache,
recaptures the complete image and crop set, independently decodes the saved
reference/actual pairs, and rederives metrics, source frames, policies and gates.
This establishes a link from source SVG to saved PNG in addition to hash and
metric integrity. Its actual validation path rejects false approval, missing
views, changed source identity, weakened policy, and consistently rehashed
SVG/PNG substitutions. The completed report links the exact owned input report;
partial output retains its failed phase and completed-view count.

The physical-page certificate consumes a completed meet-primary producer and
its completed independent checker:

```text
node tools/TikzVisual/calibrate-arrow-meet-pdf.mjs artifacts/arrow-meet-source-calibration/run-<uuid>/report.json artifacts/arrow-meet-source-checks/run-<uuid>/report.json
node tools/TikzVisual/check-arrow-meet-pdf.mjs artifacts/arrow-meet-pdf-calibration/run-<uuid>/report.json
node tools/TikzVisual/calibrate-arrow-meet-pdf.mjs --replay artifacts/arrow-meet-pdf-calibration/run-<uuid>/report.json
```

Use the exact completed report paths printed by the commands. Each run owns a
fresh directory, captures its source identities, and retains failed output.
Replay reads the embedded primary inputs instead of requiring their original
experiment directories. Bounded loaders check paths, manifests, report bindings
and the pinned native cache before rendering.

The certificate preserves every original PDF page, physical camera, source and
scene region, and raster route. It changes only the source SVG's outer aspect
ratio and requires all 792 source/scene captures and their numeric records to
equal the earlier pinned captures exactly. It rederives the complete PDF model
without widening a limit. Exact capture reproduction is distinct from the
separately calibrated agreement between SVG and ordinary PDF.

The independent reader recaptures the bound primary images before checking the
physical pages. It also independently decodes saved PDF/SVG pairs, recomputes
regional metrics, integer RGB ink mass and first moments, checks fault deltas
and artifact coverage, and exercises rehashed substitutions through the actual
loader and verifier. A prior checker report alone cannot supply a trusted
source gate. Physical-page wrappers remove the root aspect-ratio declaration;
their success therefore requires the original meet-primary presentation gate.
These are native qualification tools and grant no public converter admission.

Native comparisons use strict deep equality with bounded failure messages.
Formatting a complete policy diff can exceed the memory needed for rendering;
the checker retains the view/control phase and the linked data for inspection.
It constructs each corruption fixture before invoking validation and requires
an assertion rejection, so a mutation or infrastructure error cannot count as
a passed control.

Each view record links the ordinary PDF raster, SVG raster, raw and amplified
differences, overlay and numbers. Baseline records also link a labeled paired
contact sheet. Open these PNGs directly or use the owned static `index.html`;
the common synchronized viewer and agent adapter retain their separate scope.

The portable meet cache preserves the complete certificate, embedded primary
inputs, both independent PDF readers, the fresh-export receipt and the native
qualification commit audit. Its seven reports retain their original bytes and
digests. The new `native-meet.bin.gz` and original `native-source.bin.gz` are
separately pinned; the original evidence and comparison helpers remain intact.
The consumer validates all 12,325 logical artifacts and their fixed report
bindings, checks the current native source guards, and rebuilds the complete
primary/PDF models and gates without invoking a browser, converter or native
TeX/PDF executable.

```text
node tools/TikzVisual/prepare-arrow-meet-image-cache.mjs
node tools/TikzVisual/prepare-arrow-meet-image-cache.mjs --replay
node tools/TikzVisual/arrow-meet-image-cache-self-test.mjs
```

Explicit preparation reads the completed qualified experiment reports and owns
fresh ignored output. It prints both archive digests and never updates the
checked-in cache or pins. Replay and normal consumers read the tracked caches;
they do not require the original experiment directories. Historical paths in
the reports identify provenance and are resolved through the archive.

The versioned logical-file wrapper uses the unchanged binary codec. It divides
large files into ordered chunks of at most 16 MiB, verifies their original
lengths and SHA-256 after reconstruction, and rejects missing, reordered, unused
or substituted content. This preserves the exact 30,263,040-byte policy under
the original 30 MB physical-blob bound. Compressed, decoded, logical-file,
logical-total and index sizes are bounded independently. Fixed external pins
prevent consistently rehashed replacement evidence from becoming an accepted
profile. Cache qualification still grants no public converter image admission.

Open the owned `index.html` or its paired PNGs to inspect native comparisons.
The independent native source/PDF qualification and portable input freeze are
complete. Public image-only sensitivity, a new owned public combined trial,
independent checking and fresh exported-tree reproduction remain required
before public arrow image admission. Earlier public baseline and
aspect-ratio diagnostics describe their original captured sources; they are
historical evidence when the current emitter differs.

The separate meet baseline commands consume those frozen inputs and retain
the earlier source trial. Six fixtures, two primary routes, natural/expanded
framing, 1x/4x and transparent/white/black backgrounds produce 144 primary pairs.
Both PDF raster routes retain original/public source and normalized scene
comparisons, including exact agreement with the already qualified page rasters.
No candidate pixels select a reference camera, region or allowance.

```text
node tools/TikzVisual/trial-arrow-meet-baselines.mjs
node tools/TikzVisual/check-arrow-meet-baselines.mjs artifacts/arrow-public-meet-baselines/run-<uuid>/report.json
```

The independent checker reruns the public numeric command, validates source
frames and frozen limits, and renders the expected SVGs again. Every saved
primary/PDF PNG and paired crop must match that capture before independent
decoding of regional metrics, RGB ink moments, outside-diagram exposure and
presentation panels. Controls include consistently rehashed PNG substitutions
through the actual SVG/image binding. A successful baseline check retains the
pending public image-only controls and fixed-family admission gates.

The public primary control commands apply sixteen defect families and two
visibility probes to the captured public SVGs. The 306-view matrix uses the
native cameras, regions and already qualified limits. It bypasses numeric
defect gates and does not invoke the converter or native tools. Each mutation
records the public path ID, native target region and exact TikZ source span.
No-raster-change, declared-invisible and source-frame outcomes remain explicit.

```text
node tools/TikzVisual/trial-arrow-primary-controls.mjs
node tools/TikzVisual/check-arrow-primary-controls.mjs artifacts/arrow-public-primary-controls/run-<uuid>/report.json
node tools/TikzVisual/trial-arrow-primary-controls.mjs --replay artifacts/arrow-public-primary-controls/run-<uuid>/report.json
```

An owned control bundle embeds the completed baseline and its independent,
fresh-export and commit-audit proofs with fixed external hashes. Replay needs
that bundle and tracked native caches; historical experiment directories are
not inputs. Its `index.html` links paired images, target crops and source
attribution. The independent checker reconstructs the expected mutations,
renders every saved SVG again, checks every PNG/crop byte, independently decodes
regional metrics and rechecks mutation deltas. Corruption controls exercise
fully rehashed SVG, source-span, policy-binding and PNG substitutions. Passing
primary controls leaves public PDF controls and combined admission pending.

The public PDF control matrix retains 396 views through both raster routes:
96 baselines, 124 defects, 32 visibility presentations, 96 outside-diagram
marks and 48 padding presentations. Each view compares both original source
framing and the normalized full-page scene against unchanged ordinary PDF
pages. Numeric defect gates are bypassed. The report preserves native policy
route identifiers; `publicSource` identifies views using captured public SVGs.

```text
node --max-old-space-size=2048 tools/TikzVisual/trial-arrow-pdf-controls.mjs
node --max-old-space-size=2048 tools/TikzVisual/check-arrow-pdf-controls.mjs artifacts/arrow-public-pdf-controls/run-<uuid>/report.json
node --max-old-space-size=2048 tools/TikzVisual/trial-arrow-pdf-controls.mjs --replay artifacts/arrow-public-pdf-controls/run-<uuid>/report.json
```

The bundle embeds the qualified primary controls and their independent,
fresh-export and commit-audit proofs under fixed hashes. The checker rechecks
all 306 bound primary views before the PDF views, binds every saved SVG/PNG and
focus crop, independently decodes regional metrics and integer RGB moments,
and verifies full-page/outside-diagram exposure and mutation deltas. Fixed
target crops use the same rectangles on the ordinary PDF and saved SVG page;
the gallery labels integer enlargement and raw difference amplification.
Source framing, extra ink and padding remain separate required checks.
Passing these controls leaves combined public image admission pending.
The full bundle and corruption validation use a 2 GB Node heap in development;
the package has no dependency on these tools or their memory settings.

The portable public-control archive retains the complete historical public
qualification, its independent readers, fresh-export proof, commit audit and
focused first-moment evidence. It resolves shared bytes through the two pinned
native archives already in the repository; no original experiment directories,
TeX/PDF executables, browser or npm packages are needed to load it.

```text
node --max-old-space-size=2048 tools/TikzVisual/prepare-arrow-public-image-cache.mjs --replay
node --max-old-space-size=2048 tools/TikzVisual/arrow-public-image-cache-self-test.mjs
```

Historical production sources are checked against their captured bytes.
Comparison tools, numeric comparator sources, native fixtures and policy code
remain guarded against current files. This lets a later compiler build consume
the same qualification without replacing it. The archive is development
evidence: a current candidate still needs fresh public conversion, numeric,
frame, primary and PDF checks against the independently frozen native profile.
Captured public SVGs do not become reference expectations for admission.

The owned current-candidate harness compiles the current converter and captures
every baseline and both complete image-only control matrices against the frozen
native profile. Its independent checker compiles again, binds saved SVGs to
images and crops, decodes regional quantities and RGB moments, and checks
fully rehashed substitutions. Separate x-only and y-only moment forgeries retain
unchanged ink mass and coverage. The complete agent inspection index links every
view, fixed focus crop and source attribution; the HTML gallery provides an
initial selection without reducing required coverage.

```text
node --max-old-space-size=4096 tools/TikzVisual/trial-arrow-current.mjs
node --max-old-space-size=4096 tools/TikzVisual/check-arrow-current.mjs artifacts/arrow-current-trials/run-<uuid>/report.json
```

The current trial keeps image admission pending. Immutable family admission and
fresh-export qualification remain separate requirements. These development
commands do not add any dependency to the production library.

The portable combined archive retains the completed current-candidate trial,
both independent checks and their numeric captures, the fresh-export receipt,
commit audit and original interruption diagnostic. It shares exact bytes with
the pinned public/native archives. Loading and replay need no historical
experiment directory, npm package, browser or TeX/PDF executable.

```text
node --max-old-space-size=4096 tools/TikzVisual/prepare-arrow-current-image-cache.mjs --replay
node --max-old-space-size=4096 tools/TikzVisual/arrow-current-image-cache-self-test.mjs
```

Captured production sources remain historical provenance. Current comparison
code and fixtures stay guarded, so later compiler repairs can use this evidence
without changing the fixed native qualification. The archive keeps raw admission
flags pending and preserves declared assembly/command-directory differences;
a new candidate still requires the full fresh compilation and image checks.

Multiple tips per side, bending/flex, reversed/harpoon/open/round variants, custom
arrow declarations and other arrow libraries remain unsupported. Unknown tips,
missing libraries, unsupported options and invalid dimensions produce source
diagnostics. This prototype does not establish full PGF arrow or TeX compatibility.

The immutable arrow profile binds the six fixtures, native policy/frame hashes,
all required baseline and control views, sixteen aggregate gates and independent
check counts. Historical reports retain their pending flags. The conformance
command owns a new converter trial and independently compiled image checker;
only a complete passing result carries an image conformance claim.

```text
node --max-old-space-size=4096 tools/TikzVisual/arrow-admission-self-test.mjs
node --max-old-space-size=4096 tools/TikzVisual/compare-arrow-conformance.mjs
node --max-old-space-size=4096 tools/TikzVisual/arrow-admission-self-test.mjs --report artifacts/arrow-conformance/run-<uuid>/report.json
node --max-old-space-size=4096 tools/TikzVisual/check-arrow-conformance.mjs artifacts/arrow-conformance/run-<uuid>/report.json
```

The owned result includes the profile, raw child reports, numeric/source
captures, every image/crop and an inspection index with direct source attribution.
The saved-proof checker materializes the bound trial and repeats the full
independent image/moment checks with another current compilation. Structural
loading alone does not establish image bindings. The profile remains specific
to its declared local renderer; hosted rendering needs separate qualification.

The pinned PGF SVG driver has a default-arrow-fill defect when an attached
label uses the same color as the path stroke: its color cache can skip setting
the tip fill, leaving black in the SVG while unmodified pdfTeX fills it with
the stroke color. The [four-row fixture](../tests/Fixtures/Diagrams/arrow-color-contract.tikz)
isolates no-label, matching-label, different-label and explicit `color=` cases.
The public converter emits the PDF-consistent teal tip in all four cases.

A [native-reference hook](../tools/TikzVisual/svg-arrow-color-workaround.mjs)
reapplies PGF's automatic tip fill after its normal color setup. The separate
live native control verifies corrected SVG color, unchanged geometry and other
paint, identical PDF pixels, and plain/probed noninterference. It retains the
original and corrected backend outputs and the observed cache traces:

```text
node tools/TikzVisual/arrow-color-driver-self-test.mjs
```

The hook belongs to reference generation; the production assembly remains
independent of TeX. The closed explicit-color corpus keeps its frozen evidence.
The standard native producer applies the hook only to two pinned trusted
fixtures: the four-row contract and the
[complete flowchart](../tests/Fixtures/Diagrams/flowchart-draw-color.tikz).
It retains original plain/probed SVGs and their wrapper, corrected plain/probed
SVGs, and the unmodified PDF with its rasters. Independent readers require
unchanged root, geometry, clips, glyph contours/positions/paint and all other
path paint; only the declared default tip fills may change. Rehashed corruption
controls reuse the shared artifact/report machinery. The primary image harness
also replaces a visible affected tip's fill with black and requires pixel
rejection with numeric checks bypassed.

```text
node tools/TikzVisual/path-label-reference.mjs flowchart-draw-color
node tools/TikzVisual/path-label-reference.mjs arrow-color-contract
node tools/TikzVisual/svg-arrow-color-evidence-self-test.mjs <native-report>
node tools/TikzVisual/diagram-arrow-reference.mjs <native-report>
```

Both fixtures pass affected comparisons of fresh public/traced conversion:
2,508 native numeric checks, 48 current SVG views, 16 PDF views through both
gates and 64 independent current recaptures. Portable-cache, final-source and
clean-export qualification of this scope remains pending.
