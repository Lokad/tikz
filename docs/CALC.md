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

## Grounding and validation

The fixed combined profile binds independently qualified native primary/PDF
limits and the portable native and public-trial archives. Run fresh admission with:

```text
node tools/TikzVisual/compare-calc-conformance.mjs
```

Pass its printed report path to `tools/TikzVisual/check-calc-conformance.mjs`
for independent checking and reconstruction from current public sources. The
[reference and inspection workflow](../tools/TikzCalcReference/README.md)
also documents the bound corruption controls and paired inspection images.
Current admission requires fresh conversion, numeric/frame agreement, both
primary capture routes, original/public SVG against ordinary PDF, image-only
defects and controlled visibility. The checker recomputes decoded pixels and
gates and independently recaptures the source; hashes or recorded metrics alone
do not establish source-to-image correspondence. Changed production sources
require a fresh result under the unchanged native policy.

Admission covers only the fixed glyph-free, opaque-black 0.4-pt fixture under
its pinned renderer. Broader labels, paint, interactions and hosted execution
need their own evidence. Complete-diagram calc interactions also belong to the
separate [diagram verification matrix](VERIFICATION.md).

## Historical research

The retained primary/PDF research, native-only calibration and public-trial
reports keep their original roles and verdicts. They explain native serialization
differences, independent PDF page placement including wrapper glue, regional
ink/edge limits and visible overflow/faint/clipping controls. Their archives
preserve source, images, independent recaptures and fully rehashed corruption
witnesses. Those snapshots support the fixed profile; current acceptance comes
from the fresh admission and checker above.
