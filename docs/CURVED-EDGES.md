# Curved connections

The public converter implements a bounded curved `to` and `edge` prototype.
Five independently authored [fixtures](../tests/Fixtures/CurvedEdges) retain
70 native PGF path calls, original SVG/PDF outputs, measured node borders,
glyph positions, effective paint state and physical paint order. The converter
passes 2,066 numeric assertions against that evidence. These counts cover the
fixed corpus. Its separate immutable conformance command requires the scoped
numeric, framing and independently calibrated image gates together.

Supported connection parameters are `bend left`, `bend right`, `bend angle`,
`in`, `out`, `relative`, `looseness`, `in looseness`, `out looseness`,
`min distance`, `max distance`, `distance`, and their `in`/`out` forms.
`every to`, `every edge` and `every curve to` participate in scoped option
evaluation. Custom `to path`, explicit control-point options, loops, path
labels and arrow tips remain outside this prototype.

Connections resolve into ordinary cubic paths in the graphics scene. The
runtime independently models PGF's finite angle normalization, integer distance
estimate, looseness scaling and ordered minimum/maximum clamps. Relative
curves establish their frame after adjusting implicit node borders; absolute
curves use node angle anchors to compute controls, then resolve borders toward
those controls. Labels are measured before these queries. This introduces no
production TeX, process, font installation or package dependency.

The fixtures distinguish `to` continuation from deferred `edge` branches,
relative-coordinate prescanning, grouped options, transformed coordinate
bases, curved clipping and compound fill. They also retain two empty native
backend strokes, a visible-path observer's construction/shipped paint
differences, and a move-only path. The separate bounded driver reader ignores
only empty paths. Existing straight-edge observers, snapshots and image
profiles remain unchanged.

The native producer checks that its probes preserve the SVG drawing, picture
box, ordinary PDF bytes, raster pages and physical page position. A fresh
live replay compares this evidence with the frozen snapshot. Normal tests
and the public numeric command consume tracked evidence without launching
TeX. Cache controls reject changed inputs and inconsistent native driver state;
ordinary tests reject one-scaled-point control errors in every case.

```text
dotnet test Lokad.TikZ.slnx -c Release
node tools/TikzVisual/curved-edge-reference.mjs check-cached
node tools/TikzVisual/curved-edge-evidence-self-test.mjs
dotnet run --project tools/TikzCurvedEdgeComparison -c Release
```

The [inspection command](../tools/TikzVisual/CURVED-EDGE-INSPECTION.md) turns one
completed numeric run into paired 1x/4x PNGs, raw differences, worst-region
crops, source/scene links and a local overlay/blink viewer. It retains original
SVG and ordinary-PDF differences under exact diagnostic comparisons. It grants
no image allowance or admission. The native frame, primary and PDF commands
below provide independent measurements and image-only controls. A combined
public trial provides the raw research evidence; the separate admission command
below consumes a pinned profile for these fixed fixtures.

A separate [native-only frame and rendering experiment](../tools/TikzVisual/CURVED-EDGE-ORACLE.md)
now derives conservative frames, curved clip bounds and 389 local regions from
the reference alone. It compares native encodings/root choices with original
SVG and ordinary PDF and exposes a saved-image checker. It invokes no public
converter and grants no image acceptance limit.

The [native primary calibration](../tools/TikzVisual/CURVED-EDGE-PRIMARY.md)
selects one independently serialized representation and measures per-view/local
limits against unchanged original SVG. Eighteen image-only faults and three
separate opacity probes test sensitivity with numeric gates bypassed. A saved
image checker rebuilds the native inputs and recomputes every measurement.
These raw development reports keep their unapproved roles. The combined
consumer requires the separately qualified PDF evidence and a fresh public trial.

The [native PDF qualification](../tools/TikzVisual/CURVED-EDGE-PDF.md) now supplies
separate original-driver/native-semantic page comparisons, complete replays and
signed root-boundary controls. PDF-grid defect visibility and controlled SVG
faint-ink expectations are independent of the primary policy. A saved-evidence
checker reconstructs native inputs and remeasures full pages and inspection
panels. These remain unapproved development evidence; a fresh combined public
trial and separately pinned admission consume them; broader interactions need
additional independent evidence.

The [public combined trial](../tools/TikzVisual/CURVED-EDGE-TRIAL.md) now connects
fresh numeric conversion to the independent primary and PDF policies. It retains
all native regions and direct path/glyph/clip source spans, then exercises fresh
image-only defects. A separate checker converts afresh and remeasures the saved
images. These trial commands cannot promote a policy or claim immutable admission.

The [portable trial](../tools/TikzVisual/CURVED-EDGE-CACHED.md) now materializes
the original independent qualifications from a tracked, externally pinned
archive. It owns the fresh public trial and that exact trial's saved-evidence
checker, without old research directories or native reference tools. Archive
integrity and original source identities are checked before conversion; no
candidate output supplies an expected value. Immutable admission remains separate.

The [fixed-family admission](../tools/TikzVisual/CURVED-EDGE-CONFORMANCE.md)
checks the profile's external digest, native/cache identities, complete coverage
and guard sources before owning a fresh cached trial/checker. All eight gates
are required, including the exact independently reconstructed native SVG pages
and fresh image-only defects. Original-driver SVG and ordinary PDF keep their
separate calibrated claims. Only a completed admission report claims a pass.

Its agent report ranks 6,224 regional observations with direct path, glyph and
clip source spans. The local viewer embeds the exact paired PNGs and provides
integer zoom, synchronized scroll, blink, overlay and differences. Independent
inspection controls check saved-image bindings, crop pixels, source spans and
navigation, including a visible defect. Wider interactions, loops, arrows,
path labels and hosted qualification remain outside this fixed profile.
