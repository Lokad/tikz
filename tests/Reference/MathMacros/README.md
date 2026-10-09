# Numeric assignment observations

These snapshots retain independent PGF 3.1.11a scalar results and named-node
anchors for two fixed trusted fixtures. They prepare the bounded numerical
assignment implementation; they do not claim current converter support or
image conformance.

Regenerate only these repository-authored inputs with the existing observer:

```powershell
node tools/TikzVisual/diagram-positioning-reference.mjs flowchart-math-macros math-macro-contract math-macro-zero-divisor math-macro-overflow
```

The command pins source and native tools, records actual native inputs, and
requires plain/probed SVG drawing noninterference. A small scalar hook observes
the declared assignments in order; internal PGF calls remain separately
recorded. It uses the existing artifact and bounded process routines. The two
error fixtures must retain their native division-by-zero/overflow rejection.
Live native generation is separate from ordinary tests.

The complete flowchart retains five named nodes/80 anchors and seven scalar
calls across loop-created coordinates, styles, positioning, arrows, path labels
and calc. The focused corpus retains 25 nodes/400 anchors and 26 scalar calls,
covering intermediate rounding, fractional division, self-reassignment, groups,
scopes and foreach restoration. Native printed values such as `0.1*0.2 =
0.01999`, `7/1.5 = 4.6667`, and `(1/3)*3 = 0.99998` preclude substituting
ordinary continuous arithmetic for the numeric assignment contract.

Snapshots preserve source hashes, text boxes, matrices, anchors and each printed
scalar result. Implementations must check fresh converter output against these
observations. Image/PDF policies and final clean-source qualification are later
feature exits. Broader PGF math and general TeX remain outside this first scope.
