# Independent labeled-border precision and framing

This development executable reconstructs all forty glyph positions from frozen
DVI/TFM inputs. It links the independent reader and targets .NET 10, with no
project or package reference. It never loads or invokes the converter.

```text
dotnet run --project tools/TikzLabelledBorderOracle -c Release
node tools/TikzVisual/inspect-labelled-border-oracle.mjs
node tools/TikzVisual/labelled-border-oracle-self-test.mjs
```

The .NET command needs no browser, TeX or PDF executable. It validates all frozen
artifact/source hashes and writes a fresh `artifacts/labelled-border-oracle/`
directory. `--out artifacts/...` selects an empty directory. Outside paths,
nonempty directories and symlinks/junctions are rejected before writing.

The inspector uses the pinned development browser. It establishes cameras and
162 local regions from original evidence before invoking the independent reader.
Original outlines and driver paint supply glyph shapes, colors, caps/joins,
opacity and dash strings; independently probed PGF paths and widths supply
geometry, while DVI/TFM records and native node frames supply glyph placement.
No candidate SVG, scene, bounds, font resource or production helper is read.

Five drawing representations isolate unchanged driver normalization, short
native-point coordinates, twelve-place point coordinates, six-place CSS
coordinates and six/twelve-place glyph matrices. The shortest point spelling
must recover the original integer scaled point. Other coefficients have explicit
decimal-rounding bounds. Every representation preserves painting order and
original outline definitions.

Each runs under two separately declared roots: the original driver box expressed
in CSS pixels at twelve places, and the native picture box at six places. Neither
root is an admitted ink-containment contract. Original-root and expanded-camera
views remain separate at 1x/4x on transparent/white/black backgrounds. There are
360 pairs and 19,440 local observations, with repeated original captures, raw
differences, overlays and two paired crops per view. Changing the root must
preserve drawing instructions and exact expanded captures. Unchanged driver
normalization must produce exact expanded pixels against the original.

Read the hashed `artifacts/labelled-border-oracle-inspection/latest.json` pointer,
then its `report.json`, `agent.contactSheet` or `index.html`. The bundle retains
all native inputs, independent tools, glyph records, complete serialized
instructions and per-value error checks. The self-test verifies every artifact,
rederives all SVGs, checks 2,340 serialization and 120 root quantities, and rejects
corrupt coverage, roots, metrics, roles, artifacts and reader dependencies.

The experiment measures precision/framing effects. It derives no image tolerance
and reports `overallVerdict: pending`, `converterInvoked: false` and
`imageConformanceClaim: false`. Image-only sensitivity, independent ink bounds,
PDF comparisons and immutable combined admission remain separate required work.
Prepared cached CI commands retain these research artifacts; hosted execution
remains unverified.
