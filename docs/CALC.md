# Calculated coordinates

The experimental `calc` subset supports coordinate arithmetic, interpolation,
fixed-distance placement and projection. Load it with `\usetikzlibrary{calc}`
or `TikzOptions.Libraries = ["calc"]`.

```tex
\usetikzlibrary{calc}
\begin{tikzpicture}
  \coordinate (a) at (1,0);
  \coordinate (b) at (3,2);
  \draw (a)--($(a)!.5!(b)$)--(b);
\end{tikzpicture}
```

| Form | Meaning |
| --- | --- |
| `($(a)+(b)-(c)$)` | Add and subtract coordinate vectors |
| `($2*(a)-.5*(b)$)` | Apply scalar factors to terms |
| `(${sqrt(2)/2}*(a)$)` | Group a factor expression before `*(` |
| `($(a)!.25!(b)$)` | Interpolate from `a` to `b`; fractions outside `[0,1]` extrapolate |
| `($(a)!5mm!(b)$)` | Place a point a physical distance from `a` toward `b` |
| `($(a)!(c)!(b)$)` | Project `c` onto the line through `a` and `b` |
| `($(a)!.5!30:(b)$)` | Rotate the target around `a`, then apply the interpolation |
| `($(a)!.5!(b)!1.25!(c)$)` | Apply modifiers successively |
| `($( $(a)+(b)$ )-(c)$)` | Nest a calculated coordinate |

Terms can contain Cartesian or polar pairs, physical dimensions, named
coordinates and explicit node anchors such as `(n.north)`. A bare node name
inside a calculation supplies its center. Calculated coordinates also work
in ordinary path coordinate positions, including outer `+` and `++` forms.
The existing coordinate basis and active transforms apply. `xslant` and
`yslant` compose with the other supported affine transform keys.

Factors and rotation angles must be dimensionless. A modifier with physical
units selects distance placement. Numeric expressions use the existing
bounded expression evaluator. Unknown names, invalid expressions and unsupported
forms return source-aware diagnostics. `let` path commands, tangent/other
explicit coordinate systems and arbitrary TeX macro execution are deferred.
Library loading takes effect in source order and remains local to one
conversion; a declaration inside a scope is visible afterward in that conversion.

Coordinates are evaluated in the active local frame with finite scaled-point
products, interpolation, normalized directions and rotations. This preserves
observable PGF behavior in transformed calculations. In the reference fixture,
ideal world-vector addition would miss about 0.03 CSS px of native transform
rounding. Parsing, nested calculations, every modifier and resulting geometry
share the conversion's work, depth, coordinate and output limits.

The ordinary regression suite compares all 25 cached native coordinate anchors
exactly in integer TeX scaled points. It includes nested and chained forms,
both slants, rotated distance/projection, mixed basis/physical terms and node
anchors, plus invalid/deferred input, sequential loading, depth/work/output
limits, caller cancellation and concurrent conversions across four cultures.
The reference uses PGF 3.1.11a and the T1 Latin Modern default font profile;
measurement probes preserve the exact native SVG and TeX box.

These numeric checks qualify the fixed fixture's anchors. Development tooling
exports public/traced parity and paired primary images with native framing,
source regions and initial image-only controls. The fixed 1x captures agree
exactly; the retained 4x captures expose small serialization/raster differences.
The public picture bounds also match independently measured PGF bounds exactly
in scaled points. Native PDF tooling measures the picture's page position
separately from the surrounding TeX box, including its leading glue, and
captures both SVG routes against ordinary PDF with full-page overflow controls.
An independent saved-image checker recomputes the PNG measurements without a
browser, checks a fresh public conversion and recaptures both research bundles
with the pinned development renderer. Native PDF bytes and raster pages have
a separate source pin; hashes and recorded metrics alone cannot establish
source-to-image correspondence. Corruption controls include fully rehashed
PNG/metric substitutions that must fail the recapture check.
This is research evidence with no admitted image policy. Independent image
calibration tooling now measures three native-only primary encodings and
twelve defect families under both capture routes. Renderer-only faint and
clipping controls remain distinct from native TikZ compatibility. Separate
native-only PDF calibration uses four native encodings on the independently
measured page, with pixel/edge limits and regional RGB ink/moment ranges.
Image-only defects include a fixed page-corner overflow region. The independent
saved-PDF checker recomputes all measurements and recaptures the complete
native-only calibration, requiring identical PNGs and presentation artifacts.
A fresh public primary/PDF trial, combined admission and broader interactions
remain separate requirements.
The [reference and inspection workflow](../tools/TikzCalcReference/README.md)
records commands for reproducing measurements and paired images.
