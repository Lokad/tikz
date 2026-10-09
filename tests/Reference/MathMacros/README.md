# Numeric assignment observations

These snapshots retain independent PGF 3.1.11a scalar results and named-node
anchors for three fixed trusted fixtures. Ordinary tests compare fresh
conversion against these observations for the [declared numeric grammar](../../../docs/MATH-MACROS.md).
Image/PDF admission and final clean-source qualification remain pending.

Regenerate only these repository-authored inputs with the existing observer:

```powershell
node tools/TikzVisual/diagram-positioning-reference.mjs flowchart-math-macros math-macro-contract math-scalar-boundaries math-macro-zero-divisor math-macro-overflow math-macro-reciprocal-overflow
```

The command pins source and native tools, records actual native inputs, and
requires plain/probed SVG drawing noninterference. A small scalar hook observes
the declared assignments in order; internal PGF calls remain separately
recorded. It uses the existing artifact and bounded process routines. The three
error fixtures must retain their native division-by-zero/overflow rejection.
Live native generation is separate from ordinary tests.

The complete flowchart retains five named nodes/80 anchors and seven scalar
calls across loop-created coordinates, styles, positioning, arrows, path labels
and calc. The focused corpus retains 25 nodes/400 anchors and 26 scalar calls,
covering intermediate rounding, fractional division, self-reassignment, groups,
scopes and foreach restoration. Native printed values such as `0.1*0.2 =
0.01999`, `7/1.5 = 4.6667`, and `(1/3)*3 = 0.99998` preclude substituting
ordinary continuous arithmetic for the numeric assignment contract.

The boundary fixture adds 32 scalar observations and one sentinel node/16
anchors, covering literal formatting, signs, tiny operands, register limits,
fractional division carry/remainder and reciprocals. The reciprocal overflow
control retains native rejection for `0/0.00002` even with a zero numerator.

The observer's article wrapper can produce an empty first SVG page for the tall
focused corpus. Its scalar and anchor measurements are retained; that SVG is
not an image reference. Full drawing noninterference and image iteration use
the complete-diagram producer's owned one-page SVG/PDF evidence instead:

```powershell
node tools/TikzVisual/path-label-reference.mjs math-macro-contract
```

Snapshots preserve source hashes, text boxes, matrices, anchors and each printed
scalar result. Implementations must check fresh converter output against these
observations. Image/PDF policies and final clean-source qualification are later
feature exits. Broader PGF math and general TeX remain outside this first scope.
