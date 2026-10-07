# Curved connections

The public converter implements a bounded curved `to` and `edge` prototype.
Five independently authored [fixtures](../tests/Fixtures/CurvedEdges) retain
70 native PGF path calls, original SVG/PDF outputs, measured node borders,
glyph positions, effective paint state and physical paint order. The converter
passes 2,066 numeric assertions against that evidence. These counts cover the
fixed corpus; pixel conformance for this family remains pending.

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
no image allowance or admission. Independent frame/region validation,
primary/PDF calibration and image-only defect controls are the next grounding
steps for this family.

A separate [native-only frame and rendering experiment](../tools/TikzVisual/CURVED-EDGE-ORACLE.md)
now derives conservative frames, curved clip bounds and 389 local regions from
the reference alone. It compares native encodings/root choices with original
SVG and ordinary PDF and exposes a saved-image checker. It invokes no public
converter and grants no image acceptance limit.
