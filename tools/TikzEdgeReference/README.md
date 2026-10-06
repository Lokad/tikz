# Straight `to` and `edge` native grounding

This development-only corpus records independent PGF/TikZ 3.1.11a behavior.
The [public straight connection prototype](../../docs/EDGES.md) now agrees with
its fixed numeric evidence. Native generation/validation commands here do not
invoke the converter, admit an image allowance, or establish candidate rendering
conformance. The references remain unchanged by candidate comparisons.

Five authored [fixtures](../../tests/Fixtures/Edges) cover continuation, styles,
coordinates, measured node borders and clipping. They produce 99 native path
calls, 90 painted paths, two clips, four labeled nodes, 64 node anchors, one
named coordinate and a retained sixteen-glyph DVI trace. References use the
existing Latin Modern 10/12 font profile and an explicit xcolor RGB profile.

| Fixture | Path calls / paints | Main distinctions |
| --- | --- | --- |
| `continuation` | 20 / 19 | `to` continues the parent; repeated `edge` branches preserve its position and relative base; cycle and unpainted parents |
| `styles` | 22 / 20 | Local/every-path/to/edge options, removed default drawing, fill/stroke, inherited dash, caps/joins and opacity |
| `coordinates` | 19 / 19 | Absolute/relative target prescan, local transforms/bases, named coordinates, polar/reflected/sheared frames |
| `nodes` | 21 / 21 | Measured labels and rectangle/circle/ellipse borders, explicit anchors, transformed frames, chains and branches |
| `clipping` | 17 / 11 | Existing and newly established clips, invisible edge bounds, separate fill, degenerate round-capped edges and scope restoration |

Run cached validation and its controls from the repository root:

```text
node tools/TikzVisual/edge-reference.mjs check-cached
node tools/TikzVisual/edge-evidence-self-test.mjs
```

These commands need Node built-ins only. The cached reader pins snapshot SHA-256
`269a0bdd6eaa7f2e71b8558ba8b2a80b797c101139ad9b52c674d1aec4f0287a`, checks
every artifact and current reference-source hash, reparses both native logs and
physical-order traces, derives page placement again, verifies probe invariance,
and reads effective state from the original SVG and PDF. It executes 1,130
driver-state assertions across the fixed corpus. The separate checker passes
334 controls for missing/changed/rehashed evidence, native parser and driver
state defects, and independently observed source semantics. An overridden outer
dash declaration remains an explicit positive control: the inner declaration
determines the shipped state.

Only explicit native production uses TeX:

```text
node tools/TikzVisual/edge-reference.mjs generate
node tools/TikzVisual/edge-reference.mjs verify-live
```

`generate` writes [tests/Reference/Edges](../../tests/Reference/Edges) after all
five fixtures pass. `verify-live` produces a fresh isolated bundle and compares
its original artifacts and snapshot with the frozen references;
it does not replace them. A deliberate reference revision requires old/new
review, a newly reviewed consumer digest and all cached/live controls again.
Both modes accept only the fixed repository manifest, never arbitrary input.
Live replay requires exact bytes everywhere except independently observed
dvisvgm glyph-definition ordering and its dependent hash/byte-invariance
metadata. That comparison sorts uniquely named definition paths only, preserves
both originals, and rejects glyph-outline, path, viewport, camera, source and
noninterference changes. Nine explicit replay controls exercise this boundary.

The producer checks the existing MiKTeX 25.4/pdfTeX 4.21, PGF 3.1.11a, dvisvgm
3.4.3, DVItype and Poppler 24.04.0 identities. It disables shell escape and
package installation, bounds subprocess time/output, and retains command logs.
Plain and instrumented wrappers compile separately through both SVG and PDF
backends. Visible SVG drawing, TeX box sizes, PDF bytes, full-page PNGs and page
positions must remain unchanged. SVG glyph-definition order is canonicalized
only for noninterference and live replay; original files remain untouched. Logs
sanitize local paths and startup/DVI timestamps while preserving versions,
native measurements and diagnostics.

Construction state and shipped state have separate records. An `edge` is
constructed before its parent path finishes, but it paints after that parent.
DVI specials and deferred PDF writes independently establish that order. The
bounded SVG/PDF readers verify the effective colors, fill/stroke, native width,
dash, caps/joins, opacity and inherited clip chains in physical paint order.
They reject unsupported syntax; they are not general file interpreters.

Six active-state differences remain visible between construction and shipment:
the styled edge inherits its parent's dash and phase and a separate edge
inherits stroke opacity; the node family has inherited dash and stroke color;
the degenerate edge inherits its parent's round cap. The native construction
records are retained unchanged. Later compiler comparisons must use effective
state for rendering and construction records for explaining evaluation.

The native inspection gallery uses the existing pinned Playwright/Chromium
development setup:

```text
node tools/TikzVisual/edge-inspect.mjs
```

Read the completed GUID report selected by
`artifacts/edge-native-inspection/latest.json`, then open its `index.html` or
paired PNGs directly. Each case retains original source/SVG/PDF, native records,
1x/4x full pages, identical integer crops, a contact sheet, raw/amplified
differences and an overlay. Placement comes from measured picture/page origins
with explicit TeX-point/big-point/CSS conversions. The viewer supports native-size
zoom. Every link and artifact has a recorded hash, and source/input captures
belong to that run.

The SVG-versus-PDF images show cross-renderer differences, including thin ink
and glyph edges. No thresholds are selected and no image pass is reported.
The current driver reader verifies paint state and clip chains; it does not
prove path geometry, text placement, or raster equivalence. Native soft paths,
node measurements, glyph traces and original files supply the subsequent
candidate comparison. A separate [numeric command and candidate gallery](../TikzEdgeComparison/README.md)
now execute 2,585 public assertions and retain original SVG/PDF comparisons.
Broader edge paths, bends, labels, arrows, libraries and candidate image admission
remain required. Hosted CI is prepared and
has not been verified by this local work. All tools stay outside the production
package, whose dependency policy remains .NET only.
