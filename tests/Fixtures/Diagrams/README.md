# Complete diagram corpus

These 17 repository-authored flowcharts and networks exercise features together:
measured labels and node borders, positioning, path labels, arrows and calculated
coordinates, with scoped computation, paint and plots in the cases below. They
remain required regressions in the routine 30-fixture qualification matrix.
The other 13 fixtures are focused contracts or placement/interaction cases;
`arrow-color-contract.tikz` is one of those focused cases, rather than a complete
flowchart. The [coverage mapping](../../../docs/VERIFICATION.md) records the
whole matrix, independent checks, retained defects and pixel policies.

| Complete diagrams | Interaction exercised |
| --- | --- |
| [flowchart-basic](flowchart-basic.tikz), [network-bent](network-bent.tikz), [flowchart-transformed](flowchart-transformed.tikz) | Positioned measured nodes, straight/curved connections, sloped labels, arrows, calc and active-frame transforms |
| [flowchart-parameterized](flowchart-parameterized.tikz), [flowchart-foreach](flowchart-foreach.tikz), [flowchart-math-macros](flowchart-math-macros.tikz), [network-math-functions](network-math-functions.tikz) | Scoped styles, bound iterations and finite computed coordinates combined with node layout and routes |
| [network-coordinate-plot](network-coordinate-plot.tikz), [network-function-plot](network-function-plot.tikz), [network-smooth-plot](network-smooth-plot.tikz) | Coordinate/function sampling, smooth geometry and fills alongside labels and connections |
| [flowchart-paint](flowchart-paint.tikz), [flowchart-draw-color](flowchart-draw-color.tikz) | Paint inheritance, opacity, dash/cap/join/clip interactions and implicit arrow fill |
| [network-math-labels](network-math-labels.tikz), [flowchart-styled-labels](flowchart-styled-labels.tikz) | Measured math and mixed-face/size multiline labels with positioned and sloped routes |
| [flowchart-definitions](flowchart-definitions.tikz), [flowchart-arc-order](flowchart-arc-order.tikz), [flowchart-fill-rules](flowchart-fill-rules.tikz) | Lazy token definitions, ordered radius assignments and independent compound fill/clip rules in complete diagrams |

Run commands from the repository root:

```text
# Ordinary tests and four representative complete diagrams.
node tools/TikzVisual/verify.mjs iterate

# Ordinary tests and the affected feature's focused/interaction cases.
node tools/TikzVisual/verify.mjs iterate --feature positioning
node tools/TikzVisual/verify.mjs iterate --case flowchart-fill-rules

# All 30 fixtures, fresh converter output and independent numeric/image checks.
node tools/TikzVisual/verify.mjs qualify
```

Affected selectors are `core`, `labels`, `positioning`, `styles`, `definitions`,
`arcs`, `fillrules`, `foreach`, `macros`, `functions`, `plots`, `paint`, `math`
and `styled`. A selected fixture or iteration run has its selected scope; it
does not establish full-matrix or release acceptance. The routine command keeps
each feature's distinct native measurements, original SVG/PDF registration,
whole/local pixel policies and meaningful negative controls. It reuses shared
artifact/process/corruption handling and unchanged frozen reference evidence.
It does not invoke TeX or regenerate native calibration.

Reports under ignored `artifacts/verification/` identify the source tree,
completed scope, timings and owned family results. Follow those exact report
links to the returned SVG/scene, original source spans, paired images, raw and
amplified differences, overlays and targeted crops. A partial or failed report
is not a pass. See the [testing guide](../../../docs/TESTING.md) for the native
reference and agent-inspection workflow.

Fixtures are trusted repository reference inputs. Arbitrary or unsupported input
is exercised only against the converter; only trusted fixtures may enter native
reference generation. The [compatibility contracts](../../../docs/compatibility.md)
define the supported subsets. Fixed diagram passes do not imply general TeX/TikZ
compatibility, arbitrary-renderer pixel identity or completion of broader hosted
and release qualification.
