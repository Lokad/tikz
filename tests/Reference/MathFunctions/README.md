# Selected function observations

These independent PGF 3.1.11a snapshots retain 1,490 printed scalar results and
688 named-node anchors for three fixed trusted sources. The small network combines
degree-based worker placement with styles, loops, positioning, five path labels,
six arrows and calculated coordinates. The compact focused corpus covers signs,
periods, fractional angles, nested calls, comparison limits and scope restoration.
The boundary fixture adds 1,440 results: sine and cosine at every whole and half
degree in a complete turn, plus a sentinel node with 16 anchors.

The current public converter implements the selected `abs`, `sin`, `cos` and
two-argument `min`/`max` contract. Ordinary tests compare all printed results and
anchors. The network and focused corpus also pass 5,866 independent numeric
checks against fresh conversion, with paired 1x/4x raw image differences retained.
These iteration checks leave image/PDF policies and final clean-source acceptance
open; raw image differences do not establish calibrated conformance.

Regenerate only the fixed repository-authored inputs through the existing
scalar/node observer:

```sh
node tools/TikzVisual/diagram-positioning-reference.mjs network-math-functions math-functions-contract math-function-boundaries
```

The observer verifies source hashes, pinned tool versions and PGF version,
records executable/native input hashes, and requires unchanged plain/probed
SVG drawing. It retains ordered user scalar calls separately from internal PGF
calls. Native execution remains development tooling.

| Native expression | Printed result |
| --- | --- |
| `abs(-0.00001)` / `min(0.00001,0.00002)` | `0.00002` |
| `cos(30)` | `0.86603` |
| `sin(45)` / `cos(45)` | `0.7071` |
| `sin(0.5)` / `cos(0.5)` | `0.00873` / `0.99992` |
| `sin(359.99999)` / `cos(179.99999)` | `0.0` / `-0.99998` |
| `sin(-16294)` / `sin(-16383)` | `-0.99756` / `0.05234` |
| `min(16383.9,16383.99)` | `16383.0` |
| `max(-16383.9,-16383.99)` | `-16383.0` |

These are finite PGF results. Function operands are read as TeX dimensions;
trigonometry normalizes degrees and interpolates whole-degree cosine values
with separate finite products. The sine route subtracts 90 degrees before
normalization; both listed large negative inputs succeed natively. Minimum and
maximum start from PGF's fixed `16383`/`-16383` values. Implementations must
compare fresh conversion against these observations, preserve scoped source
provenance, and charge shared work and depth budgets. Existing coordinate
function semantics and broader PGF functions remain separate scope.
