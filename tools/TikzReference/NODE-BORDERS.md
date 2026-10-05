# Rectangle node borders

Bare `(node)` path coordinates now retain their implicit-border meaning.
`(node.center)` and other explicit anchors remain fixed coordinates. Label
measurement and shape layout precede border resolution; SVG serialization
receives the completed path.

PGF defers an implicit move until it knows the outgoing direction. A line
approaches the target border from the previous semantic position, then starts
the next outgoing segment at a separately resolved border. Orthogonal segments
query the appropriate local-frame corner; cubic segments use their first and
second controls. Circle/rectangle construction and `cycle` flush a pending
move at the center, following the corresponding TikZ path scanner operations.

The intersection follows the pinned PGF scaled-point register operations,
including truncated eighth-sized directions, reciprocal integer division,
printed-dimension multiplication, outer separation, and the near-center rule.
An analytic intersection gives different answers, especially near PGF's small
direction thresholds. Singular node-frame border queries produce a source
diagnostic instead of a fabricated intersection.

The [primitive manifest](../../tests/Reference/NodeBorders/cases.json) contains
29 trusted direction/size probes across quadrants, odd scaled points, small
direction thresholds, zero/negative extents, and long directions. The
[wrapper](rectangle-borders.tex) calls PGF directly and records integer sp
results. This route never invokes Lokad.TikZ. Ordinary tests check these values
exactly, with manifest/measurement hashes.

```text
dotnet run --project tools/TikzReference -c Release -- verify-rectangle-borders
```

`generate-rectangle-borders` explicitly writes references for this trusted
manifest; verification leaves cached references untouched.

The [path manifest](../../tests/Reference/NodeBorders/path-cases.json) contains
three independently authored TikZ fixtures: straight chains/relative and
explicit anchors/near-center queries, orthogonal/cubic/closed/shape paths, and
rotated/sheared/transformed nodes and queries. Their cached original SVG/PDF,
native soft paths, bounds, anchors, logs, and tool/input provenance come from
the existing noninterfering reference wrapper. Ordinary public-conversion
tests require 0.00004 CSS px for every numeric quantity. This bound accounts
for printed native measurements and output conversion; the direct primitive
checks still require exact integers.

The three cases pass all 835 numeric assertions. Original primary/PDF failures
remain; the transformed case also differs from the original driver's natural
frame by 0.091652 CSS px. The checked-in
[calibration snapshot](../../tests/Reference/NodeBorders/calibration.json) records
nine oracle-only representations with passing numeric/dimension budgets and
raw raster differences. It admits no policy. The transformed-node stroke frame
must be independently measured before explaining that sizing discrepancy.

```text
dotnet run --project tools/TikzReference -c Release -- compare-border-paths --out artifacts/node-border-candidates
dotnet run --project tools/TikzReference -c Release -- calibrate-border-paths --out artifacts/node-border-calibration
```

The comparison currently returns **1**, retaining exact-primary and ordinary
PDF failures. It is a provisional experiment, separate from the admitted
nine-case geometric suite and RGB/ink node interaction policies. Parser
acceptance and passing numeric checks do not establish visual conformance.
Each output case has a JSON report, paired PNGs, differences/crops, and a local
viewer. The calibration route invokes no converter: it re-expresses native
paths in CSS units, preserves paint, and measures fixed ±4-sp variants. Its
separate numeric budget covers the declared perturbation and serialization;
it does not relax the candidate's 0.00004 CSS px contract.

Next review the independently measured primary/PDF discrepancies, require local
path-region and image-only defect controls, and admit a separately pinned
policy only when all applicable gates pass. Labeled-node border interactions,
additional shapes, `to`/`edge`, bends, path labels, and arrow shortening remain
separate required work. No existing family allowance is inherited.
